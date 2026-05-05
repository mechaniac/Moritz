import { describe, it, expect } from 'vitest';
import {
  affineFromStyle,
  transformGlyph,
  transformVertex,
} from '../../src/core/transform.js';
import { v2, ZERO, constantWidth, type StyleSettings, type Glyph } from '../../src/core/types.js';

const baseStyle: StyleSettings = {
  slant: 0,
  scaleX: 1,
  scaleY: 1,
  defaultWidth: constantWidth(4),
  widthOrientation: 'tangent',
  worldAngle: 0,
  capStart: 'round',
  capEnd: 'round',
};

describe('transform', () => {
  it('identity affine leaves vertex unchanged', () => {
    const m = affineFromStyle(baseStyle);
    const v = { p: v2(3, 5), inHandle: v2(1, 0), outHandle: v2(0, 1) };
    const out = transformVertex(m, v);
    expect(out.p).toEqual({ x: 3, y: 5 });
    expect(out.inHandle).toEqual({ x: 1, y: 0 });
    expect(out.outHandle).toEqual({ x: 0, y: 1 });
  });

  it('scaleX stretches x but not y', () => {
    const m = affineFromStyle({ ...baseStyle, scaleX: 2 });
    const out = transformVertex(m, { p: v2(3, 5), inHandle: ZERO, outHandle: ZERO });
    expect(out.p).toEqual({ x: 6, y: 5 });
  });

  it('slant shears x by tan(slant) * y', () => {
    const slant = Math.PI / 12; // 15°
    const m = affineFromStyle({ ...baseStyle, slant });
    const out = transformVertex(m, { p: v2(0, 10), inHandle: ZERO, outHandle: ZERO });
    expect(out.p.x).toBeCloseTo(Math.tan(slant) * 10, 6);
    expect(out.p.y).toBe(10);
  });

  it('transformGlyph scales the box too', () => {
    const g: Glyph = {
      char: 'A',
      box: { w: 100, h: 140 },
      strokes: [],
    };
    const out = transformGlyph({ ...baseStyle, scaleX: 1.5, scaleY: 0.5 }, g);
    expect(out.box).toEqual({ w: 150, h: 70 });
  });
});
