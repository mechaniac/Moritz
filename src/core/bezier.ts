/**
 * Cubic Bézier helpers. Wraps `bezier-js` so the rest of the codebase
 * never imports it directly. All functions are pure.
 *
 * A "segment" here is a single cubic Bézier defined by 4 absolute points
 * (p0, c1, c2, p1). A `Stroke` from `types.ts` becomes a chain of segments
 * between consecutive vertices, with control points `vertex.p + handle`.
 *
 * Adoption-queue row #2 (see docs/platform-team-wishlist.md): the pure
 * cubic + tangent + segment-construction helpers now delegate to
 * `@christof/sigrid-curves` (slice 92, `glyphSpline2d`). The legacy
 * function names are kept as thin re-exports/aliases so the ~25 call
 * sites across the renderer don't have to change in lockstep. The
 * `bezier-js`-backed helpers (`segmentLength`, `closestPointT`,
 * `sampleStroke`) stay local until upstream ships an arc-length and
 * projection equivalent; once it does, this file disappears entirely.
 */

import { Bezier } from 'bezier-js';
import {
  evalGlyphCubicSegment,
  glyphStrokeToSegments,
  glyphVertexPairToSegment,
  unitTangentGlyphCubicSegment,
  type GlyphCubicSegment2d,
} from '@christof/sigrid-curves';
import type { Stroke, Vec2, Vertex } from './types.js';

export type CubicSegment = GlyphCubicSegment2d;

/** Build the chain of cubic segments from a stroke's vertices. */
export function strokeToSegments(stroke: Stroke): CubicSegment[] {
  // Local `Stroke` is structurally a `GlyphSplineStroke` (it has the
  // required `id` and `readonly vertices: readonly Vertex[]`, and `Vertex`
  // is a structural superset of `GlyphSplineVertex`). The extra fields
  // (`width`, `capStart`, `capEnd`) are ignored upstream.
  return glyphStrokeToSegments(stroke);
}

export function vertexPairToSegment(a: Vertex, b: Vertex): CubicSegment {
  return glyphVertexPairToSegment(a, b);
}

/** Sample a single cubic at parameter t∈[0,1]. */
export function pointAt(seg: CubicSegment, t: number): Vec2 {
  return evalGlyphCubicSegment(seg, t);
}

/**
 * Unit tangent at parameter t. Falls back to the chord direction at
 * degenerate parameters (zero-length handles), matching the behaviour the
 * rest of Moritz' renderer assumes.
 */
export function tangentAt(seg: CubicSegment, t: number): Vec2 {
  return unitTangentGlyphCubicSegment(seg, t);
}

/** Approximate arc length using bezier-js (used for width-profile mapping). */
export function segmentLength(seg: CubicSegment): number {
  return new Bezier(seg.p0, seg.c1, seg.c2, seg.p1).length();
}

/**
 * Project `q` onto the segment and return the parameter `t∈[0,1]` of the
 * nearest point on the curve. Used by the editor to insert an anchor
 * exactly under an alt-click. Powered by bezier-js's `.project()`.
 */
export function closestPointT(seg: CubicSegment, q: Vec2): number {
  const b = new Bezier(seg.p0, seg.c1, seg.c2, seg.p1);
  const r = b.project(q) as { t?: number };
  if (typeof r.t === 'number' && Number.isFinite(r.t)) {
    return Math.min(1, Math.max(0, r.t));
  }
  return 0.5;
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
