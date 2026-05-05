import { describe, it, expect } from 'vitest';
import {
  pointAt,
  tangentAt,
  strokeToSegments,
  vertexPairToSegment,
} from '../../src/core/bezier.js';
import { v2, ZERO, type Stroke } from '../../src/core/types.js';

const corner = (x: number, y: number) => ({
  p: v2(x, y),
  inHandle: ZERO,
  outHandle: ZERO,
});

describe('bezier', () => {
  it('vertexPairToSegment makes a degenerate-cubic from corner anchors (handles=0)', () => {
    const seg = vertexPairToSegment(corner(0, 0), corner(10, 0));
    expect(seg.p0).toEqual({ x: 0, y: 0 });
    expect(seg.c1).toEqual({ x: 0, y: 0 });
    expect(seg.c2).toEqual({ x: 10, y: 0 });
    expect(seg.p1).toEqual({ x: 10, y: 0 });
  });

  it('pointAt at t=0 and t=1 returns endpoints', () => {
    const seg = vertexPairToSegment(corner(0, 0), corner(10, 4));
    expect(pointAt(seg, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(seg, 1)).toEqual({ x: 10, y: 4 });
  });

  it('tangentAt is unit length for a non-degenerate segment', () => {
    const seg = vertexPairToSegment(corner(0, 0), corner(10, 0));
    const t = tangentAt(seg, 0.5);
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(1, 5);
  });

  it('strokeToSegments produces N-1 segments', () => {
    const stroke: Stroke = {
      id: 'x',
      vertices: [corner(0, 0), corner(10, 0), corner(20, 0), corner(30, 0)],
    };
    expect(strokeToSegments(stroke)).toHaveLength(3);
  });
});
