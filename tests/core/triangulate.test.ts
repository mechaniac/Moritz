import { describe, expect, it } from 'vitest';
import { triangulatePolygon } from '../../src/core/triangulate.js';

describe('triangulatePolygon', () => {
  it('triangulates a square into 2 triangles', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const tris = triangulatePolygon(square);
    expect(tris).toHaveLength(2);
  });

  it('triangulates a convex pentagon into 3 triangles', () => {
    const n = 5;
    const poly = Array.from({ length: n }, (_, i) => ({
      x: Math.cos((i / n) * Math.PI * 2),
      y: Math.sin((i / n) * Math.PI * 2),
    }));
    expect(triangulatePolygon(poly)).toHaveLength(n - 2);
  });

  it('handles a non-convex L-shape', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(triangulatePolygon(L)).toHaveLength(L.length - 2);
  });

  it('returns empty for degenerate input', () => {
    expect(triangulatePolygon([])).toEqual([]);
    expect(triangulatePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual([]);
  });

  it('handles clockwise polygons by flipping orientation', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    expect(triangulatePolygon(cw)).toHaveLength(2);
  });

  it('triangulates a self-touching annulus (closed-stroke outline)', () => {
    // Outer square CCW, then a "pinch point" back to start, then inner
    // square CW (the hole), then back to the pinch — exactly the shape
    // produced by outlineStroke for a closed stroke whose start/end caps
    // collapse to a point.
    const poly = [
      { x: 0, y: 0 },   // 0  start of outer
      { x: 10, y: 0 },  // 1
      { x: 10, y: 10 }, // 2
      { x: 0, y: 10 },  // 3
      { x: 0, y: 0 },   // 4  pinch (== 0)
      { x: 2, y: 2 },   // 5  start of inner
      { x: 2, y: 8 },   // 6
      { x: 8, y: 8 },   // 7
      { x: 8, y: 2 },   // 8
    ];
    const tris = triangulatePolygon(poly);
    // An annulus with 4 outer + 4 inner verts triangulates into 8 quads = 8
    // triangles (or thereabouts); demand at least 6 to verify earcut ran on
    // the hole rather than bailing at the pinch.
    expect(tris.length).toBeGreaterThanOrEqual(6);
  });
});
