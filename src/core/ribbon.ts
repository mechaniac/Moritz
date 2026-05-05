/**
 * Ribbon (quad-strip) triangulation of a stroke.
 *
 * Goal: a denser, more uniformly distributed triangle mesh than earcut, for
 * jiggle / distortion effects — WHILE matching the original outline
 * exactly. Two invariants:
 *
 *   1. Every spine anchor (segment endpoint) IS a sample. The mesh meets
 *      the earcut outline at every anchor (same miter join), so subdividing
 *      a segment never overlaps with or pulls away from the next.
 *   2. The offset polyline is C0-continuous across segments: at an interior
 *      anchor, both adjacent segments share one miter-joined left/right
 *      offset pair.
 *
 * Two density modes:
 *   - 'fixed':   N interior samples per segment (good for previews).
 *   - 'density': interior subdivisions chosen so consecutive samples are
 *                spaced ≈ `spacing` arc-length units apart.
 *
 * Caps are emitted as triangle fans around the start / end center point,
 * so the entire ribbon (sides + caps) is one cohesive triangle list and
 * the rendered fill is the union of those triangles.
 */

import {
  pointAt,
  segmentLength,
  strokeToSegments,
  tangentAt,
} from './bezier.js';
import { widthAt } from './stroke.js';
import type { Stroke, StyleSettings, Vec2 } from './types.js';
import type { Triangle } from './triangulate.js';

export type RibbonOptions =
  | { kind: 'fixed'; samplesPerSegment: number; spread?: number; anchorPull?: number }
  | { kind: 'density'; spacing: number; spread?: number; anchorPull?: number };

export type RibbonResult = {
  readonly polygon: Vec2[];
  readonly triangles: Triangle[];
};

const CAP_FAN_STEPS = 8;
const MITER_LIMIT = 4;
const ARC_LUT_SAMPLES = 32;

function unitNormal(t: Vec2): Vec2 {
  const len = Math.hypot(t.x, t.y) || 1;
  return { x: -t.y / len, y: t.x / len };
}

function intersectLines(
  p1: Vec2,
  d1: Vec2,
  p2: Vec2,
  d2: Vec2,
): Vec2 | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / denom;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

/**
 * (left, right) offset pair at an interior anchor: intersect the offset
 * lines coming from the previous segment with those leaving into the next.
 * Falls back to the average of the two endpoint pairs when the miter is
 * degenerate (parallel tangents) or beyond the miter limit (near-180°
 * reflex corner).
 */
function jointOffsetPair(
  pAnchor: Vec2,
  prevTangent: Vec2,
  nextTangent: Vec2,
  prevHalf: number,
  nextHalf: number,
  worldNormal: Vec2 | null,
): { left: Vec2; right: Vec2 } {
  const nPrev = worldNormal ?? unitNormal(prevTangent);
  const nNext = worldNormal ?? unitNormal(nextTangent);
  const leftPrev = {
    x: pAnchor.x + nPrev.x * prevHalf,
    y: pAnchor.y + nPrev.y * prevHalf,
  };
  const leftNext = {
    x: pAnchor.x + nNext.x * nextHalf,
    y: pAnchor.y + nNext.y * nextHalf,
  };
  const rightPrev = {
    x: pAnchor.x - nPrev.x * prevHalf,
    y: pAnchor.y - nPrev.y * prevHalf,
  };
  const rightNext = {
    x: pAnchor.x - nNext.x * nextHalf,
    y: pAnchor.y - nNext.y * nextHalf,
  };
  const limit = MITER_LIMIT * Math.max(prevHalf, nextHalf, 0.001);

  const lHit = intersectLines(leftPrev, prevTangent, leftNext, nextTangent);
  const left =
    lHit && Math.hypot(lHit.x - pAnchor.x, lHit.y - pAnchor.y) <= limit
      ? lHit
      : { x: (leftPrev.x + leftNext.x) / 2, y: (leftPrev.y + leftNext.y) / 2 };
  const rHit = intersectLines(rightPrev, prevTangent, rightNext, nextTangent);
  const right =
    rHit && Math.hypot(rHit.x - pAnchor.x, rHit.y - pAnchor.y) <= limit
      ? rHit
      : {
          x: (rightPrev.x + rightNext.x) / 2,
          y: (rightPrev.y + rightNext.y) / 2,
        };
  return { left, right };
}

type SpineSample = {
  readonly p: Vec2;
  readonly tangent: Vec2; // for cap orientation only
  readonly left: Vec2;
  readonly right: Vec2;
};

function interiorCount(segLen: number, opts: RibbonOptions): number {
  if (opts.kind === 'fixed') return Math.max(0, opts.samplesPerSegment | 0);
  const spacing = Math.max(0.0001, opts.spacing);
  return Math.max(0, Math.ceil(segLen / spacing) - 1);
}

/**
 * Build a small arc-length lookup for a single Bezier segment so we can map
 * an arc-length fraction back to a parameter `t`. Returns ARC_LUT_SAMPLES+1
 * cumulative chord lengths sampled at uniform `t`.
 */
function buildArcLut(seg: import('./bezier.js').CubicSegment): number[] {
  const lut = new Array<number>(ARC_LUT_SAMPLES + 1);
  lut[0] = 0;
  let prev = pointAt(seg, 0);
  let acc = 0;
  for (let i = 1; i <= ARC_LUT_SAMPLES; i++) {
    const p = pointAt(seg, i / ARC_LUT_SAMPLES);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    lut[i] = acc;
    prev = p;
  }
  return lut;
}

/** Invert the arc-length LUT: given target fraction f in [0,1], return t. */
function tForArcFraction(lut: readonly number[], f: number): number {
  const total = lut[lut.length - 1]!;
  if (total <= 0) return f;
  const target = f * total;
  // Binary search for the bracketing LUT interval.
  let lo = 0;
  let hi = lut.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lut[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = lut[lo]!;
  const b = lut[hi]!;
  const u = b > a ? (target - a) / (b - a) : 0;
  return (lo + u) / ARC_LUT_SAMPLES;
}

/**
 * Pick the parameter `t` for the i-th interior sample of a segment with
 * `interior` total interior samples.
 *
 * Two orthogonal knobs:
 *   - `spread`     in [0,1]: blend between parameter-uniform sampling (0;
 *                  clusters near anchors when the cubic has nonzero
 *                  endpoint speed) and arc-length-uniform sampling (1;
 *                  even spacing along the actual curve length).
 *   - `anchorPull` in [0,1]: bias the arc-length target through smoothstep
 *                  s(u) = u²(3−2u). At 1 the targets cluster near both
 *                  endpoints — mimicking the natural distribution of a
 *                  zero-handle anchor (where the cubic has zero parameter
 *                  speed at the endpoints, so uniform-`t` samples bunch up
 *                  there). Useful for matching the look of a non-tangent
 *                  anchor on a curve that DOES have tangents.
 *
 * `anchorPull` is applied in arc-length space, so it works regardless of
 * the underlying cubic's parameter speed.
 */
function sampleT(
  i: number,
  interior: number,
  spread: number,
  anchorPull: number,
  arcLut: readonly number[],
): number {
  const u = i / (interior + 1);
  // Cluster the *target arc fraction* via smoothstep when anchorPull > 0.
  const cluster = u * u * (3 - 2 * u);
  const targetArc = u + (cluster - u) * anchorPull;
  if (spread <= 0 && anchorPull <= 0) return u;
  // tArc = the parameter that lands at `targetArc` along the actual arc.
  const tArc = arcLut.length > 1 ? tForArcFraction(arcLut, targetArc) : targetArc;
  if (spread >= 1) return tArc;
  // Blend with parameter-uniform `u`. Note: when anchorPull > 0 we want it
  // to take effect even at spread = 0, so the floor of the blend is the
  // anchorPull-warped arc-uniform target itself, not raw `u`.
  const lo = anchorPull > 0 ? tArc : u;
  return lo + (tArc - lo) * spread;
}

/**
 * Triangulate a stroke as a ribbon (quad strip + cap fans). Open-stroke
 * invariant is enforced (matching `outlineStroke`).
 */
export function triangulateStrokeRibbon(
  stroke: Stroke,
  style: StyleSettings,
  opts: RibbonOptions,
): RibbonResult {
  if (stroke.vertices.length < 2) return { polygon: [], triangles: [] };
  const a = stroke.vertices[0]!.p;
  const z = stroke.vertices[stroke.vertices.length - 1]!.p;
  if (a.x === z.x && a.y === z.y) {
    throw new Error(
      `Stroke "${stroke.id}" is closed; ribbon triangulator requires open strokes.`,
    );
  }
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return { polygon: [], triangles: [] };
  const profile = stroke.width ?? style.defaultWidth;
  const worldNormal: Vec2 | null =
    style.widthOrientation === 'world'
      ? { x: -Math.sin(style.worldAngle), y: Math.cos(style.worldAngle) }
      : null;

  const lens = segments.map(segmentLength);
  const total = lens.reduce((s, x) => s + x, 0) || 1;
  const cum: number[] = [0];
  for (let i = 0; i < lens.length; i++) cum.push(cum[i]! + lens[i]!);

  const interiorSample = (segIdx: number, tLocal: number): SpineSample => {
    const seg = segments[segIdx]!;
    const p = pointAt(seg, tLocal);
    const tan = tangentAt(seg, tLocal);
    const tArc = (cum[segIdx]! + lens[segIdx]! * tLocal) / total;
    const half = widthAt(profile, tArc) * 0.5;
    const n = worldNormal ?? unitNormal(tan);
    return {
      p,
      tangent: tan,
      left: { x: p.x + n.x * half, y: p.y + n.y * half },
      right: { x: p.x - n.x * half, y: p.y - n.y * half },
    };
  };

  const startAnchor = (): SpineSample => interiorSample(0, 0);
  const endAnchor = (): SpineSample =>
    interiorSample(segments.length - 1, 1);
  const interiorAnchor = (segIdx: number): SpineSample => {
    const segPrev = segments[segIdx]!;
    const segNext = segments[segIdx + 1]!;
    const p = pointAt(segPrev, 1);
    const tPrev = tangentAt(segPrev, 1);
    const tNext = tangentAt(segNext, 0);
    const tArc = cum[segIdx + 1]! / total;
    const half = widthAt(profile, tArc) * 0.5;
    const { left, right } = jointOffsetPair(
      p,
      tPrev,
      tNext,
      half,
      half,
      worldNormal,
    );
    return {
      p,
      tangent: { x: (tPrev.x + tNext.x) * 0.5, y: (tPrev.y + tNext.y) * 0.5 },
      left,
      right,
    };
  };

  // Build the full sample list. Order:
  //   anchor0, [interior of seg0], anchor1, [interior of seg1], ..., anchorN
  const spread = Math.max(0, Math.min(1, opts.spread ?? 0));
  const anchorPull = Math.max(0, Math.min(1, opts.anchorPull ?? 0));
  const needsLut = spread > 0 || anchorPull > 0;
  const samples: SpineSample[] = [];
  samples.push(startAnchor());
  for (let s = 0; s < segments.length; s++) {
    const interior = interiorCount(lens[s]!, opts);
    const arcLut = needsLut ? buildArcLut(segments[s]!) : [];
    for (let i = 1; i <= interior; i++) {
      const tLocal = sampleT(i, interior, spread, anchorPull, arcLut);
      samples.push(interiorSample(s, tLocal));
    }
    if (s < segments.length - 1) samples.push(interiorAnchor(s));
  }
  samples.push(endAnchor());

  if (samples.length < 2) return { polygon: [], triangles: [] };

  const lefts = samples.map((s) => s.left);
  const rights = samples.map((s) => s.right);
  const pStart = samples[0]!.p;
  const pEnd = samples[samples.length - 1]!.p;
  const tStart = samples[0]!.tangent;
  const tEnd = samples[samples.length - 1]!.tangent;

  const polygon: Vec2[] = [];
  const triangles: Triangle[] = [];

  // Lefts forward.
  for (const p of lefts) polygon.push(p);
  const leftIdx = lefts.map((_, i) => i);

  // End cap fan: arc around pEnd, from leftLast → rightLast bowing out.
  const endCenterIdx = polygon.length;
  polygon.push(pEnd);
  const endFan: number[] = [leftIdx[leftIdx.length - 1]!];
  const endStartAngle = Math.atan2(
    lefts[lefts.length - 1]!.y - pEnd.y,
    lefts[lefts.length - 1]!.x - pEnd.x,
  );
  const endEndAngle = Math.atan2(
    rights[rights.length - 1]!.y - pEnd.y,
    rights[rights.length - 1]!.x - pEnd.x,
  );
  let dEnd = endEndAngle - endStartAngle;
  while (dEnd <= -Math.PI) dEnd += Math.PI * 2;
  while (dEnd > Math.PI) dEnd -= Math.PI * 2;
  const eMid = endStartAngle + dEnd * 0.5;
  if (Math.cos(eMid) * tEnd.x + Math.sin(eMid) * tEnd.y < 0) {
    dEnd = dEnd > 0 ? dEnd - Math.PI * 2 : dEnd + Math.PI * 2;
  }
  const endRadius = Math.hypot(
    lefts[lefts.length - 1]!.x - pEnd.x,
    lefts[lefts.length - 1]!.y - pEnd.y,
  );
  for (let k = 1; k < CAP_FAN_STEPS; k++) {
    const t = k / CAP_FAN_STEPS;
    const ang = endStartAngle + dEnd * t;
    polygon.push({
      x: pEnd.x + Math.cos(ang) * endRadius,
      y: pEnd.y + Math.sin(ang) * endRadius,
    });
    endFan.push(polygon.length - 1);
  }
  // Push rights (reversed) so they appear after the end fan.
  const rightStartIdx = polygon.length;
  for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
  const rightIdx = rights.map(
    (_, i) => rightStartIdx + (rights.length - 1 - i),
  );
  endFan.push(rightIdx[rightIdx.length - 1]!);
  for (let k = 0; k < endFan.length - 1; k++) {
    triangles.push([endCenterIdx, endFan[k]!, endFan[k + 1]!]);
  }

  // Start cap fan: arc around pStart, from rightFirst → leftFirst, bowing
  // out away from the spine (in −tStart direction).
  const startCenterIdx = polygon.length;
  polygon.push(pStart);
  const startFan: number[] = [rightIdx[0]!];
  const startStartAngle = Math.atan2(
    rights[0]!.y - pStart.y,
    rights[0]!.x - pStart.x,
  );
  const startEndAngle = Math.atan2(
    lefts[0]!.y - pStart.y,
    lefts[0]!.x - pStart.x,
  );
  let dStart = startEndAngle - startStartAngle;
  while (dStart <= -Math.PI) dStart += Math.PI * 2;
  while (dStart > Math.PI) dStart -= Math.PI * 2;
  const sMid = startStartAngle + dStart * 0.5;
  if (Math.cos(sMid) * -tStart.x + Math.sin(sMid) * -tStart.y < 0) {
    dStart = dStart > 0 ? dStart - Math.PI * 2 : dStart + Math.PI * 2;
  }
  const startRadius = Math.hypot(
    rights[0]!.x - pStart.x,
    rights[0]!.y - pStart.y,
  );
  for (let k = 1; k < CAP_FAN_STEPS; k++) {
    const t = k / CAP_FAN_STEPS;
    const ang = startStartAngle + dStart * t;
    polygon.push({
      x: pStart.x + Math.cos(ang) * startRadius,
      y: pStart.y + Math.sin(ang) * startRadius,
    });
    startFan.push(polygon.length - 1);
  }
  startFan.push(leftIdx[0]!);
  for (let k = 0; k < startFan.length - 1; k++) {
    triangles.push([startCenterIdx, startFan[k]!, startFan[k + 1]!]);
  }

  // Quad strip between consecutive samples (2 triangles per quad).
  for (let i = 0; i < lefts.length - 1; i++) {
    const l0 = leftIdx[i]!;
    const l1 = leftIdx[i + 1]!;
    const r0 = rightIdx[i]!;
    const r1 = rightIdx[i + 1]!;
    triangles.push([l0, l1, r1]);
    triangles.push([l0, r1, r0]);
  }

  return { polygon, triangles };
}
