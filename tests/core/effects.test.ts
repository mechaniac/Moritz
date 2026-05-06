import { describe, expect, it } from 'vitest';
import {
  jitterActive,
  jitterGlyphSpline,
  jitterPolygon,
  resolveJitterSeed,
} from '../../src/core/effects.js';
import type { Glyph, JitterEffect, Vec2 } from '../../src/core/types.js';

const v0: Vec2 = { x: 0, y: 0 };

const glyph: Glyph = {
  char: 'a',
  box: { w: 100, h: 100 },
  strokes: [
    {
      id: 's1',
      vertices: [
        { p: { x: 10, y: 10 }, inHandle: v0, outHandle: { x: 5, y: 0 } },
        { p: { x: 90, y: 90 }, inHandle: { x: -5, y: 0 }, outHandle: v0 },
      ],
    },
  ],
};

describe('jitterActive', () => {
  it('is false for undefined / amount=0', () => {
    expect(jitterActive(undefined)).toBe(false);
    expect(jitterActive({ amount: 0 })).toBe(false);
  });
  it('is true for amount>0', () => {
    expect(jitterActive({ amount: 0.1 })).toBe(true);
  });
});

describe('resolveJitterSeed', () => {
  const e: JitterEffect = { amount: 1, seed: 7 };
  it('text scope ignores instance and char', () => {
    const a = resolveJitterSeed({ ...e, scope: 'text' }, { instanceIndex: 0, char: 'a' }, 1);
    const b = resolveJitterSeed({ ...e, scope: 'text' }, { instanceIndex: 9, char: 'z' }, 1);
    expect(a).toBe(b);
  });
  it('glyph scope depends on char only', () => {
    const a = resolveJitterSeed({ ...e, scope: 'glyph' }, { instanceIndex: 0, char: 'a' }, 1);
    const b = resolveJitterSeed({ ...e, scope: 'glyph' }, { instanceIndex: 9, char: 'a' }, 1);
    const c = resolveJitterSeed({ ...e, scope: 'glyph' }, { instanceIndex: 0, char: 'b' }, 1);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('instance scope differs per instanceIndex', () => {
    const a = resolveJitterSeed(e, { instanceIndex: 0, char: 'a' }, 1);
    const b = resolveJitterSeed(e, { instanceIndex: 1, char: 'a' }, 1);
    expect(a).not.toBe(b);
  });
});

describe('jitterGlyphSpline', () => {
  it('returns the same glyph when amount is 0', () => {
    const out = jitterGlyphSpline(glyph, { amount: 0 }, 1);
    expect(out).toBe(glyph);
  });

  it('moves anchors within ±amount but leaves handles untouched', () => {
    const amp = 5;
    const out = jitterGlyphSpline(glyph, { amount: amp }, 42);
    const v0o = out.strokes[0]!.vertices[0]!;
    const v0i = glyph.strokes[0]!.vertices[0]!;
    expect(Math.abs(v0o.p.x - v0i.p.x)).toBeLessThanOrEqual(amp + 1e-9);
    expect(Math.abs(v0o.p.y - v0i.p.y)).toBeLessThanOrEqual(amp + 1e-9);
    expect(v0o.inHandle).toEqual(v0i.inHandle);
    expect(v0o.outHandle).toEqual(v0i.outHandle);
  });

  it('is deterministic for the same seed', () => {
    const a = jitterGlyphSpline(glyph, { amount: 3 }, 99);
    const b = jitterGlyphSpline(glyph, { amount: 3 }, 99);
    expect(a.strokes[0]!.vertices[0]!.p).toEqual(b.strokes[0]!.vertices[0]!.p);
  });

  it('does not mutate the input glyph', () => {
    const before = JSON.stringify(glyph);
    jitterGlyphSpline(glyph, { amount: 5 }, 1);
    expect(JSON.stringify(glyph)).toBe(before);
  });
});

describe('jitterPolygon', () => {
  const poly: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('returns input untouched at amount 0', () => {
    expect(jitterPolygon(poly, { amount: 0 }, 1)).toBe(poly);
  });

  it('preserves vertex count', () => {
    const out = jitterPolygon(poly, { amount: 1 }, 7);
    expect(out.length).toBe(poly.length);
  });

  it('keeps each vertex within ±amount of its original', () => {
    const amp = 0.5;
    const out = jitterPolygon(poly, { amount: amp }, 7);
    for (let i = 0; i < poly.length; i++) {
      expect(Math.abs(out[i]!.x - poly[i]!.x)).toBeLessThanOrEqual(amp + 1e-9);
      expect(Math.abs(out[i]!.y - poly[i]!.y)).toBeLessThanOrEqual(amp + 1e-9);
    }
  });
});
