import { describe, it, expect } from 'vitest';
import {
  addStroke,
  deleteAnchor,
  deleteStroke,
  insertAnchor,
  makeCorner,
  makeSmooth,
  moveAnchor,
  moveHandle,
} from '../../src/core/glyphOps.js';
import { v2, ZERO, type Glyph } from '../../src/core/types.js';

const baseGlyph: Glyph = {
  char: 'X',
  box: { w: 100, h: 100 },
  strokes: [
    {
      id: 's1',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(50, 50), inHandle: ZERO, outHandle: ZERO },
        { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    },
  ],
};

describe('glyphOps', () => {
  it('moveAnchor returns a new glyph with new anchor position', () => {
    const out = moveAnchor(baseGlyph, 0, 1, v2(10, 10));
    expect(out).not.toBe(baseGlyph);
    expect(out.strokes[0]!.vertices[1]!.p).toEqual({ x: 10, y: 10 });
    // immutability
    expect(baseGlyph.strokes[0]!.vertices[1]!.p).toEqual({ x: 50, y: 50 });
  });

  it('moveHandle stores handle relative to anchor', () => {
    const out = moveHandle(baseGlyph, 0, 0, 'out', v2(10, 5));
    expect(out.strokes[0]!.vertices[0]!.outHandle).toEqual({ x: 10, y: 5 });
  });

  it('insertAnchor adds a vertex inside the chain', () => {
    const out = insertAnchor(baseGlyph, 0, 0, 0.5);
    expect(out.strokes[0]!.vertices).toHaveLength(4);
    // Inserted at index 1, between original v0 and v1
    const inserted = out.strokes[0]!.vertices[1]!;
    expect(inserted.p.x).toBeCloseTo(25);
    expect(inserted.p.y).toBeCloseTo(25);
  });

  it('deleteAnchor reduces vertex count', () => {
    const out = deleteAnchor(baseGlyph, 0, 1);
    expect(out.strokes[0]!.vertices).toHaveLength(2);
  });

  it('deleteAnchor removes whole stroke when it would drop below 2 vertices', () => {
    const tiny: Glyph = {
      ...baseGlyph,
      strokes: [
        {
          id: 's',
          vertices: [
            { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
            { p: v2(1, 1), inHandle: ZERO, outHandle: ZERO },
          ],
        },
      ],
    };
    const out = deleteAnchor(tiny, 0, 0);
    expect(out.strokes).toHaveLength(0);
  });

  it('deleteStroke removes a stroke', () => {
    const out = deleteStroke(baseGlyph, 0);
    expect(out.strokes).toHaveLength(0);
  });

  it('addStroke appends a 2-vertex stroke', () => {
    const out = addStroke(baseGlyph);
    expect(out.strokes).toHaveLength(2);
    expect(out.strokes[1]!.vertices).toHaveLength(2);
  });

  it('makeSmooth gives the middle anchor mirrored handles aligned with chord', () => {
    const out = makeSmooth(baseGlyph, 0, 1);
    const v = out.strokes[0]!.vertices[1]!;
    // For our diagonal-chevron baseGlyph (0,0)→(50,50)→(100,0), neighbors are
    // (0,0) and (100,0): chord is +x, so handles should be ±x with y≈0.
    expect(Math.abs(v.outHandle.y)).toBeLessThan(1e-6);
    expect(v.outHandle.x).toBeGreaterThan(0);
    expect(v.inHandle.x).toBeCloseTo(-v.outHandle.x);
    expect(v.inHandle.y).toBeCloseTo(-v.outHandle.y);
  });

  it('makeCorner zeroes both handles', () => {
    const smooth = makeSmooth(baseGlyph, 0, 1);
    const out = makeCorner(smooth, 0, 1);
    const v = out.strokes[0]!.vertices[1]!;
    expect(v.inHandle).toEqual({ x: 0, y: 0 });
    expect(v.outHandle).toEqual({ x: 0, y: 0 });
  });
});
