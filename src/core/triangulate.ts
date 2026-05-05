/**
 * Polygon triangulation for the debug overlay. Uses Mapbox's `earcut`,
 * which handles non-convex polygons and polygons with holes robustly.
 *
 * For a closed stroke (first vertex coincides with last vertex), the
 * outline produced by `outlineStroke` is topologically an annulus that
 * self-touches at the cap. We detect that "pinch point" and split the
 * polygon into an outer ring + an inner hole, then triangulate with a
 * proper hole — otherwise the band collapses on itself and ear-clipping
 * cannot proceed past the touch.
 */

import earcut from 'earcut';
import type { Vec2 } from './types.js';

export type Triangle = readonly [number, number, number];

const PINCH_EPS = 1e-6;

/**
 * Find a pair of non-adjacent vertex indices `i < j` that share the same
 * position. Returns the FIRST such pair, which corresponds to the cap
 * junction of a closed stroke. Returns null if the polygon is simple.
 */
function findPinch(poly: readonly Vec2[]): { i: number; j: number } | null {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    for (let j = i + 2; j < n; j++) {
      // Skip the wrap-around adjacency (last → first).
      if (i === 0 && j === n - 1) continue;
      const b = poly[j]!;
      if (Math.abs(a.x - b.x) < PINCH_EPS && Math.abs(a.y - b.y) < PINCH_EPS) {
        return { i, j };
      }
    }
  }
  return null;
}

function flatten(rings: readonly (readonly Vec2[])[]): {
  coords: number[];
  holes: number[];
} {
  const coords: number[] = [];
  const holes: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) holes.push(coords.length / 2);
    for (const p of rings[r]!) {
      coords.push(p.x, p.y);
    }
  }
  return { coords, holes };
}

function runEarcut(
  poly: readonly Vec2[],
  rings: readonly (readonly number[])[],
): Triangle[] {
  const ringPts = rings.map((idxs) => idxs.map((k) => poly[k]!));
  const { coords, holes } = flatten(ringPts);
  const flat = earcut(coords, holes);
  const localToGlobal: number[] = [];
  for (const idxs of rings) localToGlobal.push(...idxs);
  const out: Triangle[] = [];
  for (let k = 0; k < flat.length; k += 3) {
    out.push([
      localToGlobal[flat[k]!]!,
      localToGlobal[flat[k + 1]!]!,
      localToGlobal[flat[k + 2]!]!,
    ]);
  }
  return out;
}

/**
 * Triangulate a polygon (possibly self-touching at one point, i.e. an
 * annulus produced by a closed stroke). Returns triangles as triplets of
 * indices into the original `poly` array.
 */
export function triangulatePolygon(poly: readonly Vec2[]): Triangle[] {
  const n = poly.length;
  if (n < 3) return [];

  const pinch = findPinch(poly);
  if (!pinch) {
    const allIdx = poly.map((_, k) => k);
    return runEarcut(poly, [allIdx]);
  }

  const { i, j } = pinch;
  const outerIdx: number[] = [];
  const innerIdx: number[] = [];
  for (let k = i; k < j; k++) outerIdx.push(k);
  for (let k = j; k < n; k++) innerIdx.push(k);
  for (let k = 0; k < i; k++) innerIdx.push(k);

  if (outerIdx.length < 3 || innerIdx.length < 3) {
    const allIdx = poly.map((_, k) => k);
    return runEarcut(poly, [allIdx]);
  }
  return runEarcut(poly, [outerIdx, innerIdx]);
}
