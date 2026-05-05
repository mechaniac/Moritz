/**
 * Text → positioned glyph instances. Pure function; no DOM, no measurement
 * services. Layout uses the per-glyph `box.w` (post-style transform) as advance.
 *
 * v1: single line, no kerning, no word wrap. Newlines split lines and stack
 * downward by line height = max(box.h) * lineHeightFactor.
 */

import { transformGlyph } from './transform.js';
import type { Font, Glyph, Vec2 } from './types.js';

export type PositionedGlyph = {
  readonly glyph: Glyph; // already style-transformed
  readonly origin: Vec2; // top-left of the glyph box in layout space
};

export type LayoutResult = {
  readonly glyphs: readonly PositionedGlyph[];
  readonly width: number;
  readonly height: number;
};

export type LayoutOptions = {
  readonly tracking?: number; // extra spacing between glyphs in font units
  readonly lineHeightFactor?: number; // multiplier on max glyph height
  readonly missingChar?: string; // fallback glyph key, default '?'
};

export function layout(
  text: string,
  font: Font,
  opts: LayoutOptions = {},
): LayoutResult {
  const tracking = opts.tracking ?? 0;
  const lineHeightFactor = opts.lineHeightFactor ?? 1.2;
  const fallbackKey = opts.missingChar ?? '?';

  const lines = text.split('\n');
  const placed: PositionedGlyph[] = [];

  // Pre-transform glyphs once per char (memo by char).
  const cache = new Map<string, Glyph>();
  const getGlyph = (ch: string): Glyph | null => {
    const cached = cache.get(ch);
    if (cached) return cached;
    const raw = font.glyphs[ch] ?? font.glyphs[fallbackKey];
    if (!raw) return null;
    const t = transformGlyph(font.style, raw);
    cache.set(ch, t);
    return t;
  };

  let maxLineHeight = 0;
  let maxWidth = 0;

  // First pass: figure out a stable line height from the actual used glyphs.
  for (const line of lines) {
    for (const ch of line) {
      const g = getGlyph(ch);
      if (g) maxLineHeight = Math.max(maxLineHeight, g.box.h);
    }
  }
  if (maxLineHeight === 0) maxLineHeight = 100;
  const lineStep = maxLineHeight * lineHeightFactor;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    let cursorX = 0;
    const y = li * lineStep;
    for (const ch of line) {
      if (ch === ' ') {
        cursorX += maxLineHeight * 0.4 + tracking;
        continue;
      }
      const g = getGlyph(ch);
      if (!g) continue;
      placed.push({ glyph: g, origin: { x: cursorX, y } });
      cursorX += g.box.w + tracking;
    }
    maxWidth = Math.max(maxWidth, cursorX);
  }

  return {
    glyphs: placed,
    width: maxWidth,
    height: lines.length * lineStep,
  };
}
