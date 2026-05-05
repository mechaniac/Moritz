/**
 * Simple-polygon ear-clipping triangulator. Pure function; no DOM, no deps.
 *
 * Used for the debug overlay so we can visualize the triangulation that the
 * (browser / canvas / GPU) rasterizer would conceptually do for a filled
 * polygon. Inputs are assumed to be a single closed simple polygon (no
 * holes, no self-intersections). Polygon orientation is auto-detected.
 *
 * Returns an array of triangles, each as `[a, b, c]` indices into the input.
 */

import type { Vec2 } from './types.js';

export type Triangle = readonly [number, number, number];

const EPS = 1e-9;

function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function triArea2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTri(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = triArea2(p, a, b);
  const d2 = triArea2(p, b, c);
  const d3 = triArea2(p, c, a);
  const hasNeg = d1 < -EPS || d2 < -EPS || d3 < -EPS;
  const hasPos = d1 > EPS || d2 > EPS || d3 > EPS;
  return !(hasNeg && hasPos);
}

/**
 * Triangulate a simple polygon using ear clipping. Returns triangles as
 * triplets of indices into the original polygon. Empty / degenerate input
 * yields an empty result.
 */
export function triangulatePolygon(poly: readonly Vec2[]): Triangle[] {
  const n = poly.length;
  if (n < 3) return [];

  // Build an index ring oriented CCW so the "ear convex" test is consistent.
  const ccw = signedArea(poly) > 0;
  const indices: number[] = [];
  if (ccw) {
    for (let i = 0; i < n; i++) indices.push(i);
  } else {
    for (let i = n - 1; i >= 0; i--) indices.push(i);
  }

  const triangles: Triangle[] = [];
  let guard = indices.length * indices.length;

  while (indices.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const i0 = indices[(i - 1 + indices.length) % indices.length]!;
      const i1 = indices[i]!;
      const i2 = indices[(i + 1) % indices.length]!;
      const a = poly[i0]!;
      const b = poly[i1]!;
      const c = poly[i2]!;

      // Convex corner in CCW polygon → cross product positive.
      if (triArea2(a, b, c) <= EPS) continue;

      // No other polygon vertex lies inside (or on) this triangle.
      let contains = false;
      for (let j = 0; j < indices.length; j++) {
        const ij = indices[j]!;
        if (ij === i0 || ij === i1 || ij === i2) continue;
        if (pointInTri(poly[ij]!, a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;

      triangles.push([i0, i1, i2]);
      indices.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) {
      // Degenerate polygon (self-intersecting or zero-area). Bail with what
      // we have rather than spin forever.
      break;
    }
  }

  if (indices.length === 3) {
    triangles.push([indices[0]!, indices[1]!, indices[2]!]);
  }
  return triangles;
}
