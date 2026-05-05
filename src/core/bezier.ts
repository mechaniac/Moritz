/**
 * Cubic Bézier helpers. Wraps `bezier-js` so the rest of the codebase
 * never imports it directly. All functions are pure.
 *
 * A "segment" here is a single cubic Bézier defined by 4 absolute points
 * (p0, c1, c2, p1). A `Stroke` from `types.ts` becomes a chain of segments
 * between consecutive vertices, with control points `vertex.p + handle`.
 */

import { Bezier } from 'bezier-js';
import type { Stroke, Vec2, Vertex } from './types.js';

export type CubicSegment = {
  readonly p0: Vec2;
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly p1: Vec2;
};

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

/** Build the chain of cubic segments from a stroke's vertices. */
export function strokeToSegments(stroke: Stroke): CubicSegment[] {
  const vs = stroke.vertices;
  const out: CubicSegment[] = [];
  for (let i = 0; i < vs.length - 1; i++) {
    out.push(vertexPairToSegment(vs[i]!, vs[i + 1]!));
  }
  return out;
}

export function vertexPairToSegment(a: Vertex, b: Vertex): CubicSegment {
  return {
    p0: a.p,
    c1: add(a.p, a.outHandle),
    c2: add(b.p, b.inHandle),
    p1: b.p,
  };
}

/** Sample a single cubic at parameter t∈[0,1]. */
export function pointAt(seg: CubicSegment, t: number): Vec2 {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * seg.p0.x + b1 * seg.c1.x + b2 * seg.c2.x + b3 * seg.p1.x,
    y: b0 * seg.p0.y + b1 * seg.c1.y + b2 * seg.c2.y + b3 * seg.p1.y,
  };
}

/** Unit tangent at parameter t. */
export function tangentAt(seg: CubicSegment, t: number): Vec2 {
  const u = 1 - t;
  // Derivative of a cubic Bézier:
  //   B'(t) = 3(1-t)^2 (c1-p0) + 6(1-t)t (c2-c1) + 3t^2 (p1-c2)
  const dx =
    3 * u * u * (seg.c1.x - seg.p0.x) +
    6 * u * t * (seg.c2.x - seg.c1.x) +
    3 * t * t * (seg.p1.x - seg.c2.x);
  const dy =
    3 * u * u * (seg.c1.y - seg.p0.y) +
    6 * u * t * (seg.c2.y - seg.c1.y) +
    3 * t * t * (seg.p1.y - seg.c2.y);
  const len = Math.hypot(dx, dy);
  if (len >= 1e-9) return { x: dx / len, y: dy / len };
  // Degenerate: handles collapse the derivative (typical for corner anchors
  // with zero handles → straight line). Fall back to the chord direction.
  const cx = seg.p1.x - seg.p0.x;
  const cy = seg.p1.y - seg.p0.y;
  const clen = Math.hypot(cx, cy);
  if (clen >= 1e-9) return { x: cx / clen, y: cy / clen };
  return { x: 1, y: 0 };
}

/** Approximate arc length using bezier-js (used for width-profile mapping). */
export function segmentLength(seg: CubicSegment): number {
  return new Bezier(seg.p0, seg.c1, seg.c2, seg.p1).length();
}

/**
 * Walk a chain of segments and produce N+1 evenly-spaced (by parameter)
 * sample points across the entire stroke, paired with their cumulative
 * normalized arc length t∈[0,1] for width lookup, plus tangent.
 *
 * `samplesPerSegment` keeps the math local; arc-length normalization
 * is approximate but fine for visual outlining.
 */
export type StrokeSample = {
  readonly p: Vec2;
  readonly tangent: Vec2;
  /** Normalized position along whole stroke, 0..1, by approximate arc length. */
  readonly tArc: number;
};

export function sampleStroke(
  segments: readonly CubicSegment[],
  samplesPerSegment: number,
): StrokeSample[] {
  if (segments.length === 0) return [];
  const lens = segments.map(segmentLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;

  const out: StrokeSample[] = [];
  let acc = 0;
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s]!;
    // For each segment we emit samplesPerSegment+1 points; skip the first
    // on segments after the 0th to avoid duplicating the join point.
    const start = s === 0 ? 0 : 1;
    for (let i = start; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const p = pointAt(seg, t);
      const tangent = tangentAt(seg, t);
      const localLen = lens[s]! * t;
      const tArc = (acc + localLen) / total;
      out.push({ p, tangent, tArc });
    }
    acc += lens[s]!;
  }
  return out;
}
