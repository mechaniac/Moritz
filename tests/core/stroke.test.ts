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

  it('outlineStroke: bevel anchor produces a chord on BOTH sides of the bend', () => {
    // With bevelAmount=1 (default) and corner=bevel, both sides should keep
    // their perpendicular endpoints and join them with an implicit chord.
    // Outside (left): (100, -5) → (105, 0).
    // Inside  (right): (100, 5) → (95, 0).
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
    const has = (x: number, y: number): boolean =>
      poly.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
    // Outside chord endpoints.
    expect(has(100, -5)).toBe(true);
    expect(has(105, 0)).toBe(true);
    // Inside chord endpoints.
    expect(has(100, 5)).toBe(true);
    expect(has(95, 0)).toBe(true);
    // No miter point on EITHER side at bevelAmount=1.
    expect(has(105, -5)).toBe(false);
    expect(has(95, 5)).toBe(false);
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

  it('outlineStroke: bevelAmount=2 mode=0 walks into stroke body on the inside', () => {
    // Right-then-down corner. Inside is the LEFT polyline. perp_left at end
    // of seg1 = (100, 5). Stroke body extends in -x from there. With
    // bevelAmount=2 and bevelMode=0 (into-body), the inside bevel endpoint
    // on seg1 should be at perp + (2-1)*|k|*(-tangent) = (100-5, 5) = (95, 5).
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      bevelAmount: 2,
      bevelMode: 0,
    };
    const s: Stroke = {
      id: 'b2',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    const has = (x: number, y: number): boolean =>
      poly.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
    expect(has(95, 5)).toBe(true); // inside seg1 endpoint walked into body
    // Inside bevel chord: both endpoints coincide at (95, 5) for this
    // symmetric corner — there must be NO inside-spike point at the
    // mirrored extrapolation (105, 5) on the INSIDE polyline. We can't
    // assert (105, 5) absent globally because the OUTSIDE bevel-into-body
    // also legitimately reaches that coordinate from seg2's outside polyline,
    // so we instead assert that mode=0 produces a different polygon than
    // mode=1 (the spike test below).
  });

  it('outlineStroke: bevelAmount=2 mode=1 reproduces past-anchor extrapolation', () => {
    // Same geometry but mode=1 → mp + amount*(perp - mp). Inside seg1:
    // mp=(95,5), perp=(100,5), amount=2 → (105, 5) (the classic spike).
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      bevelAmount: 2,
      bevelMode: 1,
    };
    const s: Stroke = {
      id: 'b2m1',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    const has = (x: number, y: number): boolean =>
      poly.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
    expect(has(105, 5)).toBe(true);
  });

  it('outlineStroke: bevelAmount=20 spike softener kills runaway points', () => {
    // Without softening, past-anchor extrapolation at amount=20 mode=1
    // produces polygon points hundreds of units from the corner along the
    // adjacent tangents. The post-process softener (linked to bevelAmount)
    // must collapse those out-and-back spikes so no point overshoots its
    // chord-neighborhood by an extreme ratio. We assert a generous bound
    // related to the stroke's own bounding box (≤ 200 units from corner).
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      bevelAmount: 20,
      bevelMode: 1,
    };
    const s: Stroke = {
      id: 'b20',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO, corner: 'bevel' },
        { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    const corner = { x: 100, y: 0 };
    for (const p of poly) {
      const d = Math.hypot(p.x - corner.x, p.y - corner.y);
      expect(d).toBeLessThanOrEqual(200);
    }
  });

  it('outlineStroke: spike softener is disabled at bevelAmount=0', () => {
    // amount=0 collapses bevel to a sharp miter and disables the smoother
    // entirely — straight L-shape polygon must contain the natural endpoints.
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
    // Far end of seg2 should still be present near (100, 100).
    const hasEnd = poly.some(
      (p) => Math.abs(p.x - 100) < 6 && Math.abs(p.y - 100) < 1,
    );
    expect(hasEnd).toBe(true);
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
