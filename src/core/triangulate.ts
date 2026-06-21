/**
 * Polygon triangulation for the rendered fill (single source of truth with
 * the debug overlay).
 *
 * This file adapts Moritz's local glyph-geometry mesh helper to the
 * `triangulatePolygon(poly) -> Triangle[]` signature used by renderers.
 *
 * INVARIANT: input is a single simple polygon (no holes, no self-touch).
 * Guaranteed upstream by the open-stroke rule (see `outlineStroke` in
 * `core/stroke.ts`): every stroke has a distinct start and end, so its
 * outline is one continuous boundary — never an annulus.
 */

import { triangulateSimplePolygonMesh2d } from './glyphGeometry.js';
import type { Vec2 } from './types.js';

export type Triangle = readonly [number, number, number];

/**
 * Triangulate a simple polygon. Returns triangles as triplets of indices
 * into the input `poly` array.
 *
 * Delegates to the mesh variant because it round-trips indices into the
 * original polygon via `sourceIndices`, matching the renderer expectation
 * that indices reference the input array directly.
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

/**
 * Rendering-safe triangulation. Some in-progress glyph edits can briefly
 * produce self-intersecting or otherwise degenerate outlines; callers that
 * can fall back to drawing the closed polygon should use this instead of
 * letting the editor crash.
 */
export function safeTriangulatePolygon(poly: readonly Vec2[]): Triangle[] {
  try {
    return triangulatePolygon(poly);
  } catch {
    return [];
  }
}
