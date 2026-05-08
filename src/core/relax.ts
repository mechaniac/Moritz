/**
 * Polygon relaxation passes.
 *
 * Two independent post-processing passes applied to a closed polygon
 * (the boundary of a triangulated stroke). Both PRESERVE the polygon's
 * vertex count and index order — only point coordinates move — so any
 * triangle index list built against the input polygon stays valid.
 *
 * Both passes accept a set of `pinned` indices that are never moved.
 * Callers should pin the polygon vertices that correspond to user-defined
 * anchors so the relaxer never drags an anchor away from where the user
 * placed it.
 *
 * The two passes are intentionally aggressive — at strength=1 they apply
 * a full Laplacian step per iteration. Use small values for subtle
 * smoothing; larger values for heavy distortion clean-up.
 */

import type { Vec2 } from './types.js';

/**
 * Curve relaxation: Laplacian smoothing. Each non-pinned vertex moves
 * toward the midpoint of its two polygon-neighbors by `strength` per
 * iteration. Removes high-frequency wobble; with enough iterations the
 * polygon collapses toward the convex hull of the pinned set.
 *
 * Treats the polygon as CYCLIC (vertex N-1 neighbors vertex 0).
 *
 *   strength    in [0, 1]; per-iteration step factor.
 *   iterations  integer ≥ 0; how many smoothing passes.
 *
 * Pure: returns a new array; never mutates the input.
 */
export function relaxCurves(
  polygon: readonly Vec2[],
  pinned: ReadonlySet<number>,
  strength: number,
  iterations: number,
): Vec2[] {
  const n = polygon.length;
  if (n < 3 || iterations <= 0 || strength <= 0) {
    return polygon.map((p) => ({ x: p.x, y: p.y }));
  }
  const s = Math.max(0, Math.min(1, strength));
  let cur: Vec2[] = polygon.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations; it++) {
    const next: Vec2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      if (pinned.has(i)) {
        next[i] = cur[i]!;
        continue;
      }
      const a = cur[(i - 1 + n) % n]!;
      const b = cur[(i + 1) % n]!;
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const c = cur[i]!;
      next[i] = {
        x: c.x + (mx - c.x) * s,
        y: c.y + (my - c.y) * s,
      };
    }
    cur = next;
  }
  return cur;
}

/**
 * Tangent relaxation: equalizes edge LENGTHS between consecutive
 * unpinned vertices, which in turn evens out edge tangent directions
 * (uneven spacing is the dominant source of "kinky" tangent jumps).
 *
 * For each non-pinned vertex i, slide it along the chord (a,b) between
 * its neighbors until it sits at the arc-length midpoint (i.e. `t = 0.5`
 * along the chord), blended by `strength` per iteration. Pinned
 * vertices anchor the chord, so multiple iterations propagate the
 * even-spacing constraint between pin pairs.
 *
 *   strength    in [0, 1]; per-iteration interpolation factor toward
 *               the chord midpoint.
 *   iterations  integer ≥ 0.
 *
 * Pure: returns a new array; never mutates the input.
 */
export function relaxTangents(
  polygon: readonly Vec2[],
  pinned: ReadonlySet<number>,
  strength: number,
  iterations: number,
): Vec2[] {
  const n = polygon.length;
  if (n < 3 || iterations <= 0 || strength <= 0) {
    return polygon.map((p) => ({ x: p.x, y: p.y }));
  }
  const s = Math.max(0, Math.min(1, strength));
  let cur: Vec2[] = polygon.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations; it++) {
    const next: Vec2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      if (pinned.has(i)) {
        next[i] = cur[i]!;
        continue;
      }
      const a = cur[(i - 1 + n) % n]!;
      const b = cur[(i + 1) % n]!;
      const c = cur[i]!;
      // Project c onto chord (a,b), then push that projection toward the
      // chord midpoint. This both equalizes |a-c| vs |c-b| AND removes
      // perpendicular wobble — exactly what "tangent relaxation" means
      // for a polyline where tangent ≈ edge direction.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let tx: number;
      let ty: number;
      if (len2 < 1e-12) {
        tx = a.x;
        ty = a.y;
      } else {
        const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
        // Bias the projection's parameter toward 0.5 by `s`.
        const tBiased = t + (0.5 - t) * s;
        tx = a.x + dx * tBiased;
        ty = a.y + dy * tBiased;
      }
      next[i] = {
        x: c.x + (tx - c.x) * s,
        y: c.y + (ty - c.y) * s,
      };
    }
    cur = next;
  }
  return cur;
}

/**
 * Map a 0..1 slider value into (strength, iterations). The slider is
 * non-linear so small values are gentle and the upper end is aggressive.
 * Centralized here so callers don't have to agree on a formula.
 */
export function relaxSliderToParams(amount: number): {
  strength: number;
  iterations: number;
} {
  const a = Math.max(0, Math.min(1, amount));
  if (a === 0) return { strength: 0, iterations: 0 };
  // Iterations grow from 1 at amount→0 to 16 at amount=1.
  const iterations = Math.max(1, Math.round(1 + a * 15));
  // Strength grows from ~0.1 to 0.7 so we don't oscillate.
  const strength = 0.1 + a * 0.6;
  return { strength, iterations };
}
