import { describe, it, expect } from 'vitest';
import {
  addStroke,
  cloneStroke,
  deleteAnchor,
  deleteStroke,
  flipStrokeHorizontal,
  flipStrokeVertical,
  insertAnchor,
  makeCorner,
  makeSmooth,
  moveAnchor,
  moveHandle,
  pasteStrokes,
  strokeAnchorBBox,
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

  it('cloneStroke deep-copies vertices and assigns a fresh id', () => {
    const src = baseGlyph.strokes[0]!;
    const c = cloneStroke(src);
    expect(c.id).not.toBe(src.id);
    expect(c.vertices.length).toBe(src.vertices.length);
    // Mutating the clone's vertex array (in non-strict) must not affect src
    // — assert independent references on every nested object.
    for (let i = 0; i < src.vertices.length; i++) {
      expect(c.vertices[i]!.p).not.toBe(src.vertices[i]!.p);
      expect(c.vertices[i]!.p).toEqual(src.vertices[i]!.p);
    }
  });

  it('cloneStroke applies the offset to every anchor', () => {
    const src = baseGlyph.strokes[0]!;
    const c = cloneStroke(src, { x: 10, y: -5 });
    expect(c.vertices[0]!.p).toEqual({ x: 10, y: -5 });
    expect(c.vertices[2]!.p).toEqual({ x: 110, y: -5 });
  });

  it('pasteStrokes appends clones with fresh ids', () => {
    const out = pasteStrokes(baseGlyph, baseGlyph.strokes, { x: 0, y: 0 });
    expect(out.strokes.length).toBe(baseGlyph.strokes.length + 1);
    expect(out.strokes[1]!.id).not.toBe(baseGlyph.strokes[0]!.id);
    expect(out.strokes[1]!.vertices).toEqual(baseGlyph.strokes[0]!.vertices);
  });

  it('pasteStrokes is a no-op for empty input', () => {
    const out = pasteStrokes(baseGlyph, []);
    expect(out).toBe(baseGlyph);
  });

  it('flipStrokeHorizontal mirrors anchors and negates handle x', () => {
    const g: Glyph = {
      ...baseGlyph,
      strokes: [
        {
          id: 's1',
          vertices: [
            { p: v2(10, 20), inHandle: v2(-3, 4), outHandle: v2(5, 6) },
            { p: v2(80, 70), inHandle: v2(-2, 1), outHandle: v2(7, 0) },
          ],
        },
      ],
    };
    const out = flipStrokeHorizontal(g, 0, 50); // box.w/2 = 50
    expect(out.strokes[0]!.vertices[0]!.p).toEqual({ x: 90, y: 20 });
    expect(out.strokes[0]!.vertices[1]!.p).toEqual({ x: 20, y: 70 });
    expect(out.strokes[0]!.vertices[0]!.inHandle).toEqual({ x: 3, y: 4 });
    expect(out.strokes[0]!.vertices[0]!.outHandle).toEqual({ x: -5, y: 6 });
  });

  it('flipStrokeVertical mirrors anchors and negates handle y', () => {
    const g: Glyph = {
      ...baseGlyph,
      strokes: [
        {
          id: 's1',
          vertices: [
            { p: v2(10, 20), inHandle: v2(3, -4), outHandle: v2(5, 6) },
            { p: v2(80, 70), inHandle: v2(-2, 1), outHandle: v2(7, 0) },
          ],
        },
      ],
    };
    const out = flipStrokeVertical(g, 0, 50); // box.h/2 = 50
    expect(out.strokes[0]!.vertices[0]!.p).toEqual({ x: 10, y: 80 });
    expect(out.strokes[0]!.vertices[1]!.p).toEqual({ x: 80, y: 30 });
    expect(out.strokes[0]!.vertices[0]!.inHandle).toEqual({ x: 3, y: 4 });
    expect(out.strokes[0]!.vertices[0]!.outHandle).toEqual({ x: 5, y: -6 });
  });

  it('flipStrokeHorizontal twice is identity (round-trip)', () => {
    const out = flipStrokeHorizontal(
      flipStrokeHorizontal(baseGlyph, 0, 50),
      0,
      50,
    );
    expect(out.strokes[0]!.vertices.map((v) => v.p)).toEqual(
      baseGlyph.strokes[0]!.vertices.map((v) => v.p),
    );
  });

  it('strokeAnchorBBox returns the AABB of all anchor points', () => {
    const bb = strokeAnchorBBox(baseGlyph.strokes[0]!);
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it('flipStrokeHorizontal mirrors normalOverride as a pseudo-vector (negates y)', () => {
    // normalOverride is a normal direction; under a horizontal mirror its
    // angle reflects across the x-axis, which means we negate y, NOT x.
    // (Negating x would flip the override's frame angle by 180\u00b0 and twist
    // the rendered ribbon along the segment.)
    const g: Glyph = {
      ...baseGlyph,
      strokes: [
        {
          id: 's1',
          vertices: [
            { p: v2(10, 20), inHandle: v2(0, 0), outHandle: v2(0, 0), normalOverride: v2(0, 1) },
            { p: v2(80, 70), inHandle: v2(0, 0), outHandle: v2(0, 0) },
          ],
        },
      ],
    };
    const out = flipStrokeHorizontal(g, 0, 50);
    expect(out.strokes[0]!.vertices[0]!.normalOverride).toEqual({ x: 0, y: -1 });
  });

  it('flipStrokeVertical mirrors normalOverride as a pseudo-vector (negates x)', () => {
    const g: Glyph = {
      ...baseGlyph,
      strokes: [
        {
          id: 's1',
          vertices: [
            { p: v2(10, 20), inHandle: v2(0, 0), outHandle: v2(0, 0), normalOverride: v2(1, 0) },
            { p: v2(80, 70), inHandle: v2(0, 0), outHandle: v2(0, 0) },
          ],
        },
      ],
    };
    const out = flipStrokeVertical(g, 0, 50);
    expect(out.strokes[0]!.vertices[0]!.normalOverride).toEqual({ x: -1, y: 0 });
  });
});
