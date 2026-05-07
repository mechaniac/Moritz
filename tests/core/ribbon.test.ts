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
