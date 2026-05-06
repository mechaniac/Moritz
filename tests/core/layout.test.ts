import { describe, it, expect } from 'vitest';
import { layout } from '../../src/core/layout.js';
import { defaultFont } from '../../src/data/defaultFont.js';
import type { Font, Glyph } from '../../src/core/types.js';

const baseGlyph = (overrides: Partial<Glyph> = {}): Glyph => ({
  char: 'A',
  box: { w: 100, h: 100 },
  strokes: [],
  ...overrides,
});

const fontWith = (glyphs: Record<string, Glyph>, style: Partial<Font['style']> = {}): Font => ({
  ...defaultFont,
  style: { ...defaultFont.style, ...style },
  glyphs,
});

describe('layout', () => {
  it('places one positioned glyph per non-space character', () => {
    const r = layout('AB C', defaultFont);
    expect(r.glyphs).toHaveLength(3);
  });

  it('advances by the (transformed) box width', () => {
    const r = layout('II', defaultFont);
    const [g0, g1] = r.glyphs;
    expect(g0!.origin.x).toBe(0);
    expect(g1!.origin.x).toBe(g0!.glyph.box.w);
  });

  it('newlines stack lines vertically', () => {
    const r = layout('A\nA', defaultFont);
    const [g0, g1] = r.glyphs;
    expect(g1!.origin.y).toBeGreaterThan(g0!.origin.y);
  });

  it('applies sidebearings to advance', () => {
    const A = baseGlyph({ char: 'A', sidebearings: { left: 10, right: 20 } });
    const f = fontWith({ A });
    const r = layout('AA', f);
    expect(r.glyphs[0]!.origin.x).toBe(10); // lsb
    // next cursor = 10 + 100 (box) + 20 (rsb) = 130; next lsb = 10 -> origin 140
    expect(r.glyphs[1]!.origin.x).toBe(140);
  });

  it('applies tracking between every pair', () => {
    const A = baseGlyph({ char: 'A' });
    const f = fontWith({ A }, { tracking: 5 });
    const r = layout('AAA', f);
    expect(r.glyphs[1]!.origin.x).toBe(105);
    expect(r.glyphs[2]!.origin.x).toBe(210);
  });

  it('applies typeface kerning to the matching pair only', () => {
    const A = baseGlyph({ char: 'A' });
    const V = baseGlyph({ char: 'V' });
    const f: Font = { ...fontWith({ A, V }), kerning: { AV: -15 } };
    const r = layout('AVA', f);
    // A at 0, V at 100 + (-15) = 85, A at 85 + 100 = 185 (no VA pair)
    expect(r.glyphs[1]!.origin.x).toBe(85);
    expect(r.glyphs[2]!.origin.x).toBe(185);
  });

  it('applies baselineOffset to glyph y', () => {
    const A = baseGlyph({ char: 'A', baselineOffset: 7 });
    const f = fontWith({ A });
    const r = layout('A', f);
    expect(r.glyphs[0]!.origin.y).toBe(7);
  });
});
