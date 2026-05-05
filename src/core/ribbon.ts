/**
 * Ribbon (quad-strip) triangulation of a stroke.
 *
 * Unlike `triangulatePolygon` (which is fed an arbitrary closed polygon and
 * earcuts it), this walks the stroke spine, places left/right offset pairs
 * at evenly arc-length-spaced samples, and emits two triangles per quad.
 * Result: more triangles than strictly necessary, but evenly distributed
 * along the stroke — perfect for jiggle / distortion effects that need
 * uniform vertex density per unit area.
 *
 * Two density modes:
 *  - 'fixed':   samplesPerSegment is constant (good for previews / tests).
 *  - 'density': spacing is a target arc-length in glyph units. Each
 *               segment gets max(2, ceil(length / spacing)) samples,
 *               so vertex density per unit length stays roughly constant
 *               regardless of font size or stroke length.
 *
 * Caps are emitted as a triangle fan around the start / end center point,
 * so the entire ribbon (sides + caps) is one cohesive triangle list and
 * the rendered fill is literally the union of those triangles.
 */

import {
  pointAt,
  segmentLength,
  strokeToSegments,
  tangentAt,
  type CubicSegment,
} from './bezier.js';
import { widthAt } from './stroke.js';
import type { Stroke, StyleSettings, Vec2 } from './types.js';
import type { Triangle } from './triangulate.js';

export type RibbonOptions =
  | { kind: 'fixed'; samplesPerSegment: number }
  | { kind: 'density'; spacing: number };

export type RibbonResult = {
  readonly polygon: Vec2[];
  readonly triangles: Triangle[];
};

const CAP_FAN_STEPS = 8;

function unitNormal(t: Vec2): Vec2 {
  const len = Math.hypot(t.x, t.y) || 1;
  return { x: -t.y / len, y: t.x / len };
}

function buildSamples(
  segments: readonly CubicSegment[],
  opts: RibbonOptions,
): { p: Vec2; tangent: Vec2; tArc: number }[] {
  const lens = segments.map(segmentLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out: { p: Vec2; tangent: Vec2; tArc: number }[] = [];
  let acc = 0;
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s]!;
    const len = lens[s]!;
    const subdivisions =
      opts.kind === 'fixed'
        ? Math.max(1, opts.samplesPerSegment)
        : Math.max(1, Math.ceil(len / Math.max(0.0001, opts.spacing)));
    const start = s === 0 ? 0 : 1;
    for (let i = start; i <= subdivisions; i++) {
      const t = i / subdivisions;
      out.push({
        p: pointAt(seg, t),
        tangent: tangentAt(seg, t),
        tArc: (acc + len * t) / total,
      });
    }
    acc += len;
  }
  return out;
}

/**
 * Triangulate a stroke as a ribbon (quad strip) plus two cap fans.
 * The returned `polygon` is the closed boundary (left forward, end-cap arc,
 * right reversed, start-cap arc) — useful only as metadata; the rendered
 * fill should come from the `triangles` list directly.
 */
export function triangulateStrokeRibbon(
  stroke: Stroke,
  style: StyleSettings,
  opts: RibbonOptions,
): RibbonResult {
  if (stroke.vertices.length < 2) return { polygon: [], triangles: [] };
  // Same open-stroke invariant as outlineStroke.
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

  const samples = buildSamples(segments, opts);
  if (samples.length < 2) return { polygon: [], triangles: [] };

  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (const s of samples) {
    const n = worldNormal ?? unitNormal(s.tangent);
    const half = widthAt(profile, s.tArc) * 0.5;
    lefts.push({ x: s.p.x + n.x * half, y: s.p.y + n.y * half });
    rights.push({ x: s.p.x - n.x * half, y: s.p.y - n.y * half });
  }

  // Build the polygon: lefts forward, end-cap fan (right→left around pEnd),
  // rights reversed, start-cap fan (left→right around pStart).
  const polygon: Vec2[] = [];
  const triangles: Triangle[] = [];

  // Indices into `polygon` for each left / right sample so we can stitch
  // quads. We push lefts first, so leftIdx[i] = i. After lefts come the
  // end cap fan, then rights (reversed), then the start cap fan.
  for (const p of lefts) polygon.push(p);
  const leftIdx = lefts.map((_, i) => i);

  // End cap: arc fan around pEnd from rightLast to leftLast.
  const pEnd = samples[samples.length - 1]!.p;
  const tEnd = samples[samples.length - 1]!.tangent;
  const endCenterIdx = polygon.length;
  polygon.push(pEnd);
  const endFan: number[] = [];
  endFan.push(leftIdx[leftIdx.length - 1]!);
  const endStartAngle = Math.atan2(
    lefts[lefts.length - 1]!.y - pEnd.y,
    lefts[lefts.length - 1]!.x - pEnd.x,
  );
  const endEndAngle = Math.atan2(
    rights[rights.length - 1]!.y - pEnd.y,
    rights[rights.length - 1]!.x - pEnd.x,
  );
  // Sweep the half-disk in the +tangent direction. Pick the shorter signed
  // sweep that keeps us on the outside of the stroke (Δθ in (−π, π]).
  let dEnd = endEndAngle - endStartAngle;
  while (dEnd <= -Math.PI) dEnd += Math.PI * 2;
  while (dEnd > Math.PI) dEnd -= Math.PI * 2;
  // Force the fan to bow OUT (away from the spine) by ensuring the sweep
  // goes through `+tEnd`. If the bisector of (start,end) points opposite
  // to tEnd, flip the sweep direction.
  const halfMid = endStartAngle + dEnd * 0.5;
  const bisX = Math.cos(halfMid);
  const bisY = Math.sin(halfMid);
  if (bisX * tEnd.x + bisY * tEnd.y < 0) {
    dEnd = dEnd > 0 ? dEnd - Math.PI * 2 : dEnd + Math.PI * 2;
  }
  const endRadius = Math.hypot(
    lefts[lefts.length - 1]!.x - pEnd.x,
    lefts[lefts.length - 1]!.y - pEnd.y,
  );
  for (let k = 1; k < CAP_FAN_STEPS; k++) {
    const t = k / CAP_FAN_STEPS;
    const a = endStartAngle + dEnd * t;
    const idx = polygon.length;
    polygon.push({
      x: pEnd.x + Math.cos(a) * endRadius,
      y: pEnd.y + Math.sin(a) * endRadius,
    });
    endFan.push(idx);
  }
  // Append rightLast as the closing vertex of the end fan.
  // It will be added as part of the rights-reversed run below — but the
  // fan needs an explicit reference to it. We push rights now so we know
  // their indices.
  const rightStartIdx = polygon.length;
  for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
  const rightIdx = rights.map((_, i) => rightStartIdx + (rights.length - 1 - i));
  endFan.push(rightIdx[rightIdx.length - 1]!);

  // Triangulate end fan around endCenterIdx.
  for (let k = 0; k < endFan.length - 1; k++) {
    triangles.push([endCenterIdx, endFan[k]!, endFan[k + 1]!]);
  }

  // Start cap: arc fan around pStart from leftFirst to rightFirst.
  const pStart = samples[0]!.p;
  const tStart = samples[0]!.tangent;
  const startCenterIdx = polygon.length;
  polygon.push(pStart);
  const startFan: number[] = [];
  startFan.push(rightIdx[0]!);
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
  // Bow OUT — direction of −tStart (away from spine at start).
  const sMid = startStartAngle + dStart * 0.5;
  const sBisX = Math.cos(sMid);
  const sBisY = Math.sin(sMid);
  if (sBisX * -tStart.x + sBisY * -tStart.y < 0) {
    dStart = dStart > 0 ? dStart - Math.PI * 2 : dStart + Math.PI * 2;
  }
  const startRadius = Math.hypot(
    rights[0]!.x - pStart.x,
    rights[0]!.y - pStart.y,
  );
  for (let k = 1; k < CAP_FAN_STEPS; k++) {
    const t = k / CAP_FAN_STEPS;
    const a = startStartAngle + dStart * t;
    const idx = polygon.length;
    polygon.push({
      x: pStart.x + Math.cos(a) * startRadius,
      y: pStart.y + Math.sin(a) * startRadius,
    });
    startFan.push(idx);
  }
  startFan.push(leftIdx[0]!);
  for (let k = 0; k < startFan.length - 1; k++) {
    triangles.push([startCenterIdx, startFan[k]!, startFan[k + 1]!]);
  }

  // Quad strip between consecutive left/right pairs.
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
