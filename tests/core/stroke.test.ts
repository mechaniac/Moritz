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

  it('outlineStroke: no inside-corner overshoot past the miter point', () => {
    // Same 90° corner; on the inside (right side, +y) NO sample should
    // sit past the miter intersection (which is at x=95, y=5). "Past" here
    // means x > 95 along the prev tangent (and y > 5 along the next tangent).
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
    // No inside-corner overshoot: the inside-corner pocket is the open box
    // (95, 100] × (0, 5]. Any polyline sample in there means an offset
    // polyline extended past its miter intersection at (95, 5).
    for (const p of poly) {
      if (p.x > 95.01 && p.x <= 100 && p.y > 0.01 && p.y <= 5) {
        throw new Error(`overshoot: (${p.x}, ${p.y})`);
      }
    }
  });

  it('outlineStroke: bevel corner is honored when anchor.corner=bevel', () => {
    // Same 90° corner but anchor marked as bevel: instead of the single
    // miter point at (105, -5) on the outside, we expect the two original
    // offset endpoints (100, -5) and (105, 0) joined by a chord.
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const s: Stroke = {
      id: 'beveled',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    const hasOuterMiter = poly.some(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y + 5) < 0.01,
    );
    const hasOuter1 = poly.some(
      (p) => Math.abs(p.x - 100) < 0.01 && Math.abs(p.y + 5) < 0.01,
    );
    const hasOuter2 = poly.some(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y) < 0.01,
    );
    expect(hasOuterMiter).toBe(false);
    expect(hasOuter1).toBe(true);
    expect(hasOuter2).toBe(true);
  });

  it('outlineStroke: bevel anchor does NOT self-intersect on the inside', () => {
    // Bevel must apply only on the OUTSIDE of the bend. The inside should
    // still collapse to the single miter point (95, 5) — no perpendicular
    // endpoints on the inside, which would overlap each other.
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const s: Stroke = {
      id: 'beveled',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    // Inside corner must contain (95, 5) once (the trimmed miter), and
    // NEITHER of the perpendicular endpoints (100, 5) or (95, 0) — those
    // would extend the inside polyline past the meeting point.
    const hasMiter = poly.some(
      (p) => Math.abs(p.x - 95) < 0.01 && Math.abs(p.y - 5) < 0.01,
    );
    const hasInner1 = poly.some(
      (p) => Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 5) < 0.01,
    );
    const hasInner2 = poly.some(
      (p) => Math.abs(p.x - 95) < 0.01 && Math.abs(p.y) < 0.01,
    );
    expect(hasMiter).toBe(true);
    expect(hasInner1).toBe(false);
    expect(hasInner2).toBe(false);
  });

  it('outlineStroke: bevelAmount=0 collapses bevel to a sharp miter', () => {
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      bevelAmount: 0,
    };
    const s: Stroke = {
      id: 'b0',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    // Outside corner is a single sharp point at (105, -5); no perpendicular
    // endpoints on the outside.
    const sharp = poly.filter(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y + 5) < 0.01,
    );
    const perpA = poly.some(
      (p) => Math.abs(p.x - 100) < 0.01 && Math.abs(p.y + 5) < 0.01,
    );
    const perpB = poly.some(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y) < 0.01,
    );
    expect(sharp).toHaveLength(1);
    expect(perpA).toBe(false);
    expect(perpB).toBe(false);
  });

  it('outlineStroke: round cap bulges outward (forward) at the end', () => {
    // Horizontal stroke ending at (100, 0). Round cap should add samples
    // beyond x=100 (forward of the endpoint), NOT samples at x<100 (which
    // would be the cap curling backward into the stroke body).
    const s: Stroke = {
      id: 'rc',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, style);
    const maxX = poly.reduce((m, p) => Math.max(m, p.x), 0);
    expect(maxX).toBeGreaterThan(104); // arc reaches ~halfWidth past the end
    expect(maxX).toBeLessThan(106);
  });

  it('outlineStroke: tapered cap projects a single point past the end', () => {
    const taperStyle: StyleSettings = { ...style, capStart: 'tapered', capEnd: 'tapered' };
    const s: Stroke = {
      id: 'tc',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, taperStyle);
    // Exactly one point at the forward tip (~ x=105, y=0).
    const tipHits = poly.filter(
      (p) => Math.abs(p.x - 105) < 0.01 && Math.abs(p.y) < 0.01,
    );
    expect(tipHits).toHaveLength(1);
    // And one at the backward tip (x=-5, y=0) for the start cap.
    const startHits = poly.filter(
      (p) => Math.abs(p.x + 5) < 0.01 && Math.abs(p.y) < 0.01,
    );
    expect(startHits).toHaveLength(1);
  });

  it('outlineStroke: flat cap adds no extra points past the endpoint', () => {
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const s: Stroke = {
      id: 'fc',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    // No samples should sit beyond x=100 (forward) or x=0 (backward).
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(100.01);
    }
  });
});
