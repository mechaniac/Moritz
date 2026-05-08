import { describe, expect, it } from 'vitest';
import {
  ribbonDebugSpline0,
  triangulateStrokeRibbon,
} from '../../src/core/ribbon.js';
import {
  constantWidth,
  v2,
  ZERO,
  type StyleSettings,
  type Stroke,
} from '../../src/core/types.js';

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

const lineStroke: Stroke = {
  id: 's',
  vertices: [
    { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
    { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
  ],
};

describe('triangulateStrokeRibbon', () => {
  it('emits a quad strip + cap fans for a single segment', () => {
    const r = triangulateStrokeRibbon(lineStroke, style, {
      spineSubdiv: 4,
      borderSubdiv: 0,
    });
    // spineSubdiv=4 → 4 interior vertices + 2 anchors = 6 spine vertices →
    // 5 quads → 10 quad triangles. Two round caps add capSubdiv triangles
    // each (default capSubdiv = spineSubdiv + 2 = 6).
    expect(r.triangles.length).toBeGreaterThanOrEqual(10 + 6 + 6);
    expect(r.polygon.length).toBeGreaterThan(0);
  });

  it('borderSubdiv multiplies the quad count', () => {
    const a = triangulateStrokeRibbon(lineStroke, style, {
      spineSubdiv: 2,
      borderSubdiv: 0,
    });
    const b = triangulateStrokeRibbon(lineStroke, style, {
      spineSubdiv: 2,
      borderSubdiv: 3,
    });
    expect(b.triangles.length).toBeGreaterThan(a.triangles.length);
  });

  it('borderSubdiv smooths a curved single segment (Catmull-Rom rounds, not lerps)', () => {
    // S-shaped single cubic. With borderSubdiv = 0 each border vertex is
    // already on a smooth curve, but with borderSubdiv > 0 the inserted
    // vertices follow a Catmull-Rom spline THROUGH the borders, which
    // for any curved border means the inserted vertex sits OFF the
    // chord between its two neighbors. With pure linear lerp it would
    // sit ON that chord (dev == 0 for every inserted index).
    const flatStyle: StyleSettings = { ...style, capStart: 'flat', capEnd: 'flat' };
    const sShape: Stroke = {
      id: 's',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: v2(40, 60) },
        { p: v2(100, 0), inHandle: v2(-40, -60), outHandle: ZERO },
      ],
    };
    // Just compare the *inserted* vertices: borderSubdiv=3 inserts 3 new
    // vertices between every pair of border vertices. Catmull-Rom always
    // puts those off-chord on a curved input; linear lerp always puts
    // them on-chord.
    const onChordCount = (poly: readonly { x: number; y: number }[]) => {
      let n = 0;
      for (let i = 1; i < poly.length - 1; i++) {
        const a = poly[i - 1]!;
        const b = poly[i + 1]!;
        const p = poly[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
        if (d < 1e-6) n++;
      }
      return n;
    };
    const r = triangulateStrokeRibbon(sShape, flatStyle, {
      spineSubdiv: 4,
      borderSubdiv: 3,
    });
    // With linear lerp every inserted vertex (≥ spineSubdiv·borderSubdiv on
    // each side, well above 10) is collinear with its neighbors. With
    // Catmull-Rom on a curved border, none of them are.
    expect(onChordCount(r.polygon)).toBeLessThan(5);
  });

  it('throws on closed strokes (open-stroke invariant)', () => {
    const closed: Stroke = {
      id: 's',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(10, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    expect(() =>
      triangulateStrokeRibbon(closed, style, {
        spineSubdiv: 2,
        borderSubdiv: 0,
      }),
    ).toThrow(/closed/i);
  });
});

describe('ribbonDebugSpline0', () => {
  it('returns one entry per anchor with unit tangents and a normal', () => {
    const data = ribbonDebugSpline0(lineStroke, style);
    expect(data).toHaveLength(2);
    // First anchor: tangentIn is zero, tangentOut points along +x.
    expect(data[0]!.tangentIn).toEqual({ x: 0, y: 0 });
    expect(data[0]!.tangentOut.x).toBeCloseTo(1);
    expect(data[0]!.tangentOut.y).toBeCloseTo(0);
    // Last anchor: tangentOut is zero, tangentIn points along +x.
    expect(data[1]!.tangentOut).toEqual({ x: 0, y: 0 });
    expect(data[1]!.tangentIn.x).toBeCloseTo(1);
    expect(data[1]!.tangentIn.y).toBeCloseTo(0);
    // Normal is unit length.
    for (const a of data) {
      expect(Math.hypot(a.normal.x, a.normal.y)).toBeCloseTo(1);
    }
  });
});
