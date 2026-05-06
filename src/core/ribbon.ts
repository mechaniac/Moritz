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

const CAP_FAN_STEPS_MIN = 3;
const CAP_FAN_STEPS_MAX = 64;
const MITER_LIMIT = 4;

/**
 * Number of fan steps for a round cap of the given radius sweeping `|sweep|`
 * radians. Subdivides the cap arc using the same density knob as the spine:
 *   - density mode: arc-length / spacing
 *   - fixed   mode: samplesPerSegment (the cap is treated like one segment
 *                   worth of subdivision, so caps and spine match visually).
 */
function capFanSteps(radius: number, sweep: number, opts: RibbonOptions): number {
  const arc = Math.abs(sweep) * Math.max(0, radius);
  let n: number;
  if (opts.kind === 'density') {
    const spacing = Math.max(0.0001, opts.spacing);
    n = Math.ceil(arc / spacing);
  } else {
    // Scale samplesPerSegment by sweep / PI so a half-circle maps to ~N steps.
    const base = Math.max(0, opts.samplesPerSegment | 0) + 1;
    n = Math.ceil(base * (Math.abs(sweep) / Math.PI));
  }
  return Math.max(CAP_FAN_STEPS_MIN, Math.min(CAP_FAN_STEPS_MAX, n));
}
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
 *   - `anchorPull` in [0,1]: bias the arc-length target so samples cluster
 *                  near the segment endpoint(s) whose handle is active.
 *                  At 1 a one-sided-active end behaves like a zero-tangent
 *                  anchor (zero param speed there); the inactive end stays
 *                  uniformly spaced. Curves with two active ends use a
 *                  symmetric smoothstep that clusters at both.
 *
 * `anchorPull` is applied in arc-length space, so it works regardless of
 * the underlying cubic's parameter speed.
 */
function sampleT(
  i: number,
  interior: number,
  spread: number,
  anchorPull: number,
  startActive: boolean,
  endActive: boolean,
  arcLut: readonly number[],
): number {
  const u = i / (interior + 1);
  // Choose the cluster-target arc fraction based on which ends are active.
  // All four maps satisfy f(0)=0 and f(1)=1.
  let cluster: number;
  if (startActive && endActive) cluster = u * u * (3 - 2 * u); // smoothstep
  else if (startActive) cluster = u * u; // slow at 0, fast at 1
  else if (endActive) cluster = u * (2 - u); // fast at 0, slow at 1
  else cluster = u; // no clustering
  const targetArc = u + (cluster - u) * anchorPull;
  if (spread <= 0 && anchorPull <= 0) return u;
  const tArc = arcLut.length > 1 ? tForArcFraction(arcLut, targetArc) : targetArc;
  if (spread >= 1) return tArc;
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
  const samples: SpineSample[] = [];
  samples.push(startAnchor());
  for (let s = 0; s < segments.length; s++) {
    const interior = interiorCount(lens[s]!, opts);
    // anchorPull is applied per-end: only ends with an active handle
    // (control point not coincident with anchor) get the clustering bias.
    const seg = segments[s]!;
    const startActive = seg.c1.x !== seg.p0.x || seg.c1.y !== seg.p0.y;
    const endActive = seg.c2.x !== seg.p1.x || seg.c2.y !== seg.p1.y;
    const segAnchorPull = startActive || endActive ? anchorPull : 0;
    const needsLut = spread > 0 || segAnchorPull > 0;
    const arcLut = needsLut ? buildArcLut(seg) : [];
    for (let i = 1; i <= interior; i++) {
      const tLocal = sampleT(
        i,
        interior,
        spread,
        segAnchorPull,
        startActive,
        endActive,
        arcLut,
      );
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

  // Resolve cap kinds (stroke override > style). Same logic as outlineStroke.
  const capStartShape = stroke.capStart ?? style.capStart;
  const capEndShape = stroke.capEnd ?? style.capEnd;
  const capKind = (c: typeof capStartShape): 'flat' | 'round' | 'tapered' => {
    if (c === 'flat' || c === 'round' || c === 'tapered') return c;
    return 'flat'; // 'custom' falls back to flat for now
  };
  const endCapKind = capKind(capEndShape);
  const startCapKind = capKind(capStartShape);

  // ----- End cap -----
  // The end cap closes from leftLast → ... → rightLast around pEnd.
  // Geometry varies by kind:
  //   flat    → no center vertex, single triangle (left,right,pEnd-not-needed);
  //              actually the left-last/right-last/quad-strip already meet at
  //              pEnd indirectly — we just emit one triangle covering the
  //              chord-to-spine area.
  //   round   → fan of CAP_FAN_STEPS arc points centered on pEnd.
  //   tapered → single tip vertex pushed by half-width along +tEnd.
  const endLeftIdx = leftIdx[leftIdx.length - 1]!;
  // rightIdx is filled inside one of the cap branches below — every branch
  // pushes rights to the polygon and sets this mapping.
  let rightIdx: number[] = [];
  // Push rights (reversed) AFTER cap geometry. We need the rightIdx mapping
  // ready, so compute it first by emitting cap fan vertices, then rights.
  const endFan: number[] = [endLeftIdx];
  if (endCapKind === 'round') {
    const endCenterIdx = polygon.length;
    polygon.push(pEnd);
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
    const endSteps = capFanSteps(endRadius, dEnd, opts);
    // Decompose into (along tEnd, perp tEnd) and scale the along component
    // by the global bulge knob; chord endpoints have along=0 and stay put.
    const bulge = style.capRoundBulge ?? 1;
    const eTx = tEnd.x;
    const eTy = tEnd.y;
    const ePx = -tEnd.y;
    const ePy = tEnd.x;
    for (let k = 1; k < endSteps; k++) {
      const t = k / endSteps;
      const ang = endStartAngle + dEnd * t;
      const px = Math.cos(ang) * endRadius;
      const py = Math.sin(ang) * endRadius;
      const along = px * eTx + py * eTy;
      const cross = px * ePx + py * ePy;
      polygon.push({
        x: pEnd.x + along * bulge * eTx + cross * ePx,
        y: pEnd.y + along * bulge * eTy + cross * ePy,
      });
      endFan.push(polygon.length - 1);
    }
    // Now push rights and finish fan.
    const rightStartIdxR = polygon.length;
    for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
    rightIdx = rights.map(
      (_, i) => rightStartIdxR + (rights.length - 1 - i),
    );
    endFan.push(rightIdx[rightIdx.length - 1]!);
    for (let k = 0; k < endFan.length - 1; k++) {
      triangles.push([endCenterIdx, endFan[k]!, endFan[k + 1]!]);
    }
  } else if (endCapKind === 'tapered') {
    // Single tip vertex pushed by half-width * bulge along +tEnd.
    const half = Math.hypot(
      lefts[lefts.length - 1]!.x - pEnd.x,
      lefts[lefts.length - 1]!.y - pEnd.y,
    );
    const bulgeT = style.capRoundBulge ?? 1;
    const tipIdx = polygon.length;
    polygon.push({ x: pEnd.x + tEnd.x * half * bulgeT, y: pEnd.y + tEnd.y * half * bulgeT });
    const rightStartIdxT = polygon.length;
    for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
    rightIdx = rights.map(
      (_, i) => rightStartIdxT + (rights.length - 1 - i),
    );
    triangles.push([endLeftIdx, tipIdx, rightIdx[rightIdx.length - 1]!]);
  } else {
    // flat: no extra vertices; the polygon edge from leftLast to rightLast
    // closes the cap directly. The quad strip already meets the chord.
    const rightStartIdxF = polygon.length;
    for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
    rightIdx = rights.map(
      (_, i) => rightStartIdxF + (rights.length - 1 - i),
    );
  }

  // ----- Start cap -----
  // Mirrors the end cap. Bows out in -tStart direction.
  const startRightIdx = rightIdx[0]!;
  const startLeftIdx = leftIdx[0]!;
  if (startCapKind === 'round') {
    const startCenterIdx = polygon.length;
    polygon.push(pStart);
    const startFan: number[] = [startRightIdx];
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
    const startSteps = capFanSteps(startRadius, dStart, opts);
    // Bulge along -tStart (the cap's outward direction).
    const bulgeS = style.capRoundBulge ?? 1;
    const sTx = -tStart.x;
    const sTy = -tStart.y;
    const sPx = -sTy;
    const sPy = sTx;
    for (let k = 1; k < startSteps; k++) {
      const t = k / startSteps;
      const ang = startStartAngle + dStart * t;
      const px = Math.cos(ang) * startRadius;
      const py = Math.sin(ang) * startRadius;
      const along = px * sTx + py * sTy;
      const cross = px * sPx + py * sPy;
      polygon.push({
        x: pStart.x + along * bulgeS * sTx + cross * sPx,
        y: pStart.y + along * bulgeS * sTy + cross * sPy,
      });
      startFan.push(polygon.length - 1);
    }
    startFan.push(startLeftIdx);
    for (let k = 0; k < startFan.length - 1; k++) {
      triangles.push([startCenterIdx, startFan[k]!, startFan[k + 1]!]);
    }
  } else if (startCapKind === 'tapered') {
    const half = Math.hypot(
      rights[0]!.x - pStart.x,
      rights[0]!.y - pStart.y,
    );
    const bulgeST = style.capRoundBulge ?? 1;
    const tipIdx = polygon.length;
    polygon.push({
      x: pStart.x - tStart.x * half * bulgeST,
      y: pStart.y - tStart.y * half * bulgeST,
    });
    triangles.push([startRightIdx, tipIdx, startLeftIdx]);
  }
  // flat: nothing to emit.

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
