/**
 * Polygon triangulation for the rendered fill (single source of truth with
 * the debug overlay).
 *
 * Adoption-queue row #1 (see docs/platform-team-wishlist.md): this file is a
 * thin shim over `triangulateSimplePolygonMesh2d` from
 * `@christof/sigrid-curves` (slice 104), preserving the legacy
 * `triangulatePolygon(poly) -> Triangle[]` signature so the four call sites
 * (svg export, GlyphSetter overlay, Icon, ribbon's type import) don't have
 * to change in lockstep with the platform donation.
 *
 * INVARIANT: input is a single simple polygon (no holes, no self-touch).
 * Guaranteed upstream by the open-stroke rule (see `outlineStroke` in
 * `core/stroke.ts`): every stroke has a distinct start and end, so its
 * outline is one continuous boundary — never an annulus.
 */

import { triangulateSimplePolygonMesh2d } from '@christof/sigrid-curves';
import type { Vec2 } from './types.js';

export type Triangle = readonly [number, number, number];

/**
 * Triangulate a simple polygon. Returns triangles as triplets of indices
 * into the input `poly` array.
 *
 * Delegates to upstream `triangulateSimplePolygonMesh2d` (mesh variant
 * because it round-trips indices into the original polygon via
 * `sourceIndices`, matching the legacy earcut behaviour where indices
 * referenced the input array directly).
 */
export function triangulatePolygon(poly: readonly Vec2[]): Triangle[] {
  if (poly.length < 3) return [];
  const mesh = triangulateSimplePolygonMesh2d(poly);
  const out: Triangle[] = [];
  for (const [a, b, c] of mesh.triangles) {
    out.push([
      mesh.sourceIndices[a]!,
      mesh.sourceIndices[b]!,
      mesh.sourceIndices[c]!,
    ]);
  }
  return out;
}
