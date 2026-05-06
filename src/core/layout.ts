/**
 * Text → positioned glyph instances. Pure function; no DOM, no measurement
 * services.
 *
 * Advance for a non-space glyph is:
 *     advance = (lsb ?? 0) + glyph.box.w + (rsb ?? 0)
 *               + (style.tracking ?? 0)
 *               + (style.kerning?.[prevChar+ch] ?? 0)
 *
 * v1: single line per `\n`, no word wrap.
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
  /** Override `style.tracking`. */
  readonly tracking?: number;
  /** Override `style.lineHeight`. */
  readonly lineHeightFactor?: number;
  /** Override `style.spaceWidth`. */
  readonly spaceWidth?: number;
  readonly missingChar?: string; // fallback glyph key, default '?'
};

export function layout(
  text: string,
  font: Font,
  opts: LayoutOptions = {},
): LayoutResult {
  const tracking = opts.tracking ?? font.style.tracking ?? 0;
  const lineHeightFactor =
    opts.lineHeightFactor ?? font.style.lineHeight ?? 1.2;
  const fallbackKey = opts.missingChar ?? '?';
  const kerning = font.style.kerning;

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
  const spaceW = opts.spaceWidth ?? font.style.spaceWidth ?? maxLineHeight * 0.4;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    let cursorX = 0;
    let prevChar = '';
    const y = li * lineStep;
    for (const ch of line) {
      if (ch === ' ') {
        cursorX += spaceW + tracking;
        prevChar = ch;
        continue;
      }
      const g = getGlyph(ch);
      if (!g) continue;
      // Apply kerning between previous non-space char and this char.
      if (prevChar && prevChar !== ' ' && kerning) {
        const k = kerning[prevChar + ch];
        if (k !== undefined) cursorX += k;
      }
      const lsb = g.sidebearings?.left ?? 0;
      const rsb = g.sidebearings?.right ?? 0;
      const yOff = g.baselineOffset ?? 0;
      cursorX += lsb;
      placed.push({ glyph: g, origin: { x: cursorX, y: y + yOff } });
      cursorX += g.box.w + rsb + tracking;
      prevChar = ch;
    }
    maxWidth = Math.max(maxWidth, cursorX);
  }

  return {
    glyphs: placed,
    width: maxWidth,
    height: lines.length * lineStep,
  };
}
