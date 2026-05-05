/**
 * Polygon triangulation for the rendered fill (single source of truth with
 * the debug overlay). Uses Mapbox's `earcut`, which handles arbitrary
 * non-convex simple polygons.
 *
 * INVARIANT: input is a single simple polygon (no holes, no self-touch).
 * This is guaranteed upstream by the open-stroke rule (see `outlineStroke`
 * in `core/stroke.ts`): every stroke has a distinct start and end, so its
 * outline is one continuous boundary — never an annulus.
 */

import earcut from 'earcut';
import type { Vec2 } from './types.js';

export type Triangle = readonly [number, number, number];

/**
 * Triangulate a simple polygon. Returns triangles as triplets of indices
 * into the input `poly` array.
 */
export function triangulatePolygon(poly: readonly Vec2[]): Triangle[] {
  if (poly.length < 3) return [];
  const coords: number[] = [];
  for (const p of poly) {
    coords.push(p.x, p.y);
  }
  const flat = earcut(coords);
  const out: Triangle[] = [];
  for (let k = 0; k < flat.length; k += 3) {
    out.push([flat[k]!, flat[k + 1]!, flat[k + 2]!]);
  }
  return out;
}
