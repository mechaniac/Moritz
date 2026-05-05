import { describe, it, expect } from 'vitest';
import { outlineStroke, widthAt } from '../../src/core/stroke.js';
import { constantWidth, v2, ZERO, type StyleSettings, type Stroke } from '../../src/core/types.js';

const style: StyleSettings = {
  slant: 0,
  scaleX: 1,
  scaleY: 1,
  defaultWidth: constantWidth(10),
  widthOrientation: 'tangent',
  worldAngle: 0,
  capStart: 'round',
  capEnd: 'round',
};

describe('stroke', () => {
  it('widthAt: constant profile returns the width everywhere', () => {
    const wp = constantWidth(7);
    expect(widthAt(wp, 0)).toBe(7);
    expect(widthAt(wp, 0.5)).toBe(7);
    expect(widthAt(wp, 1)).toBe(7);
  });

  it('widthAt: lerps between samples', () => {
    const wp = { samples: [{ t: 0, width: 0 }, { t: 1, width: 10 }] };
    expect(widthAt(wp, 0.25)).toBe(2.5);
    expect(widthAt(wp, 0.75)).toBe(7.5);
  });

  it('outlineStroke returns empty for <2 vertices', () => {
    const s: Stroke = { id: 'a', vertices: [{ p: v2(0, 0), inHandle: ZERO, outHandle: ZERO }] };
    expect(outlineStroke(s, style)).toHaveLength(0);
  });

  it('outlineStroke produces a closed-ish polygon for a horizontal segment', () => {
    const s: Stroke = {
      id: 'a',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, style);
    expect(poly.length).toBeGreaterThan(20);
    // For a horizontal segment with width 10, max |y| should be ~5.
    const maxAbsY = poly.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0);
    expect(maxAbsY).toBeGreaterThan(4);
    expect(maxAbsY).toBeLessThan(6);
  });

  it('outlineStroke miter-joins a 90° corner (no overshoot)', () => {
    // Two segments meeting at (100, 0): horizontal then vertical going down.
    // Width 10 → outer corner should be at (105, -5), inner at (95, 5).
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const s: Stroke = {
      id: 'corner',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    // Outside corner (left side, top-right of the bend): exactly one point at (105, -5).
    const outerHits = poly.filter(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y + 5) < 0.01,
    );
    expect(outerHits).toHaveLength(1);
    // Inside corner (right side, top-left of the bend): exactly one point at (95, 5).
    const innerHits = poly.filter(
      (p) => Math.abs(p.x - 95) < 0.01 && Math.abs(p.y - 5) < 0.01,
    );
    expect(innerHits).toHaveLength(1);
  });
});
