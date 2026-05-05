import { describe, it, expect } from 'vitest';
import { layout } from '../../src/core/layout.js';
import { defaultFont } from '../../src/data/defaultFont.js';

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
});
