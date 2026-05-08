import { describe, expect, it } from 'vitest';
import { relaxCurves, relaxSliderToParams, relaxTangents } from '../../src/core/relax.js';
import type { Vec2 } from '../../src/core/types.js';

describe('relaxCurves', () => {
  it('preserves vertex count and order', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0.5 }, { x: 1, y: 1 },
    ];
    const out = relaxCurves(poly, new Set(), 0.5, 3);
    expect(out).toHaveLength(poly.length);
  });

  it('keeps pinned vertices fixed', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }, { x: 1, y: -5 },
    ];
    const pinned = new Set([0, 2]);
    const out = relaxCurves(poly, pinned, 1, 10);
    expect(out[0]).toEqual(poly[0]);
    expect(out[2]).toEqual(poly[2]);
  });

  it('reduces a single spike toward neighbor midpoint', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 100 }, { x: 2, y: 0 }, { x: 1, y: -1 },
    ];
    const out = relaxCurves(poly, new Set([0, 2, 3]), 1, 1);
    // After one full Laplacian step, vertex 1 sits at midpoint of 0 and 2.
    expect(out[1]!.y).toBeCloseTo(0, 5);
  });

  it('is a no-op when iterations or strength is zero', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 },
    ];
    const out = relaxCurves(poly, new Set(), 0, 5);
    expect(out).toEqual(poly);
    const out2 = relaxCurves(poly, new Set(), 0.5, 0);
    expect(out2).toEqual(poly);
  });
});

describe('relaxTangents', () => {
  it('drives a non-pinned vertex toward chord midpoint', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: -1 },
    ];
    // Pin everything except vertex 1 so its target chord is fixed.
    const out = relaxTangents(poly, new Set([0, 2, 3]), 1, 8);
    // Midpoint of [0,0] and [1,0] is [0.5,0]; vertex 1 should converge there.
    expect(out[1]!.x).toBeCloseTo(0.5, 3);
    expect(out[1]!.y).toBeCloseTo(0, 5);
  });

  it('respects pinned anchors', () => {
    const poly: Vec2[] = [
      { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 },
    ];
    const out = relaxTangents(poly, new Set([0, 2]), 1, 5);
    expect(out[0]).toEqual(poly[0]);
    expect(out[2]).toEqual(poly[2]);
  });
});

describe('relaxSliderToParams', () => {
  it('returns zero work for amount 0', () => {
    expect(relaxSliderToParams(0)).toEqual({ strength: 0, iterations: 0 });
  });
  it('returns positive iterations for any positive amount', () => {
    const p = relaxSliderToParams(0.01);
    expect(p.iterations).toBeGreaterThanOrEqual(1);
    expect(p.strength).toBeGreaterThan(0);
  });
  it('clamps at amount 1', () => {
    const p = relaxSliderToParams(1);
    expect(p.iterations).toBeGreaterThanOrEqual(8);
    expect(p.strength).toBeLessThanOrEqual(1);
  });
});
