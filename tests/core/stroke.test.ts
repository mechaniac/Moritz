import { describe, it, expect } from 'vitest';
import { outlineStroke, redistributePolygonEvenly, widthAt } from '../../src/core/stroke.js';
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

  it('outlineStroke throws on closed strokes (open-stroke invariant)', () => {
    const closed: Stroke = {
      id: 's',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(10, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    expect(() => outlineStroke(closed, style)).toThrow(/closed/i);
  });

  it('outlineStroke returns empty for <2 vertices', () => {
    const s: Stroke = { id: 'a', vertices: [{ p: v2(0, 0), inHandle: ZERO, outHandle: ZERO }] };
    expect(outlineStroke(s, style)).toHaveLength(0);
  });

  it('outlineStroke produces a closed-ish polygon for a horizontal segment', () => {
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const s: Stroke = {
      id: 'a',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    // Flat caps + minimum-vertex regime: 2 endpoints × 2 sides = 4 vertices.
    expect(poly.length).toBe(4);
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

  it('outlineStroke: round cap bulges past the endpoint by ~half-width', () => {
    const s: Stroke = {
      id: 'rc',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, style); // default capStart/capEnd = 'round'
    const maxX = poly.reduce((m, p) => Math.max(m, p.x), -Infinity);
    const minX = poly.reduce((m, p) => Math.min(m, p.x), Infinity);
    // Width is 10 → half = 5 → round cap reaches ~x=105 / x=-5.
    expect(maxX).toBeGreaterThan(104);
    expect(maxX).toBeLessThan(106);
    expect(minX).toBeLessThan(-4);
    expect(minX).toBeGreaterThan(-6);
  });

  it('outlineStroke: tapered cap forms a triangular tip past the endpoint', () => {
    const taperStyle: StyleSettings = { ...style, capStart: 'tapered', capEnd: 'tapered' };
    const s: Stroke = {
      id: 'tc',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, taperStyle);
    // Half-width = 5 → tip extends to x = 105 / x = -5.
    const maxX = poly.reduce((m, p) => Math.max(m, p.x), -Infinity);
    const minX = poly.reduce((m, p) => Math.min(m, p.x), Infinity);
    expect(maxX).toBeCloseTo(105, 1);
    expect(minX).toBeCloseTo(-5, 1);
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

  it('outlineStroke: worldBlend=0 matches legacy tangent mode', () => {
    const flatTangent: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const flatBlend0: StyleSettings = { ...flatTangent, worldBlend: 0 };
    const s: Stroke = {
      id: 'wb0',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const a = outlineStroke(s, flatTangent);
    const b = outlineStroke(s, flatBlend0);
    expect(b).toEqual(a);
  });

  it('outlineStroke: worldBlend=1 places offsets along the world normal', () => {
    // Horizontal segment, world angle = 0 → world normal is (0, 1). The
    // offset polygon should therefore have its sides at y = ±5.
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      worldBlend: 1,
      worldAngle: 0,
    };
    const s: Stroke = {
      id: 'wb1',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    expect(poly.length).toBe(4);
    const ys = poly.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-5, 6);
    expect(ys[3]).toBeCloseTo(5, 6);
  });

  it('outlineStroke: worldBlend=0.5 sits between tangent and world widths', () => {
    // Horizontal segment, world angle = π/2 → world normal is (-1, 0).
    // Tangent normal is (0, 1) (left). With blend 0.5 the unit normal is
    // (-1/√2, 1/√2). Half-width 5 → offset endpoints at ±(-5/√2, 5/√2).
    const flatStyle: StyleSettings = {
      ...style,
      capStart: 'flat',
      capEnd: 'flat',
      worldBlend: 0.5,
      worldAngle: Math.PI / 2,
    };
    const s: Stroke = {
      id: 'wbh',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    const poly = outlineStroke(s, flatStyle);
    expect(poly.length).toBe(4);
    const exp = 5 / Math.SQRT2;
    // Each polygon vertex sits at (anchor.x ± exp, anchor.y ∓ exp).
    for (const p of poly) {
      expect(Math.abs(Math.abs(p.y) - exp)).toBeLessThan(1e-6);
    }
  });

  it('redistributePolygonEvenly with amount 0 returns input untouched', () => {
    const poly = [v2(0, 0), v2(10, 0), v2(10, 1), v2(0, 1)];
    expect(redistributePolygonEvenly(poly, 0)).toBe(poly);
  });

  it('redistributePolygonEvenly with amount 1 places vertices at uniform arc positions', () => {
    // Skewed polygon: most vertices clustered near one corner.
    const poly = [v2(0, 0), v2(1, 0), v2(2, 0), v2(10, 0), v2(10, 10), v2(0, 10)];
    const out = redistributePolygonEvenly(poly, 1);
    expect(out.length).toBe(poly.length);
    // Compute arc length of each output point along the ORIGINAL polyline.
    const N = poly.length;
    const cum: number[] = [0];
    for (let i = 0; i < N; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % N]!;
      cum.push(cum[i]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const P = cum[N]!;
    // For each output point find which original segment it lies on and compute arc.
    const arcOf = (p: { x: number; y: number }): number => {
      for (let i = 0; i < N; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % N]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) continue;
        const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segLen * segLen);
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const proj = { x: a.x + dx * u, y: a.y + dy * u };
        if (Math.hypot(proj.x - p.x, proj.y - p.y) < 1e-6) {
          return cum[i]! + u * segLen;
        }
      }
      return -1;
    };
    for (let i = 0; i < N; i++) {
      const expected = (i * P) / N;
      const got = arcOf(out[i]!);
      expect(got).toBeGreaterThanOrEqual(0);
      expect(Math.abs(got - expected)).toBeLessThan(1e-6);
    }
  });
});
