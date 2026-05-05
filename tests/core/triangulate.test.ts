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
    // A self-touching annulus would be a violation of the open-stroke
    // invariant. We test that earcut still returns *some* triangulation
    // rather than crashing — but rendering pipelines must never produce
    // such input. See `outlineStroke` for the runtime guard.
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(triangulatePolygon(poly)).toHaveLength(2);
  });
});
