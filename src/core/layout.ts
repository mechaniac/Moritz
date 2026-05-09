/**
 * Text → positioned glyph instances. Pure function; no DOM, no measurement
 * services.
 *
 * Advance for a non-space glyph is:
 *     advance = (lsb ?? 0) + glyph.box.w + (rsb ?? 0)
 *               + (style.tracking ?? 0)
 *               + (font.kerning?.[prevChar+ch] ?? 0) * scaleX
 *
 * v1: single line per `\n`, no word wrap.
 */

import { transformGlyph } from './transform.js';
import { jitterActive, jitterGlyphSpline, resolveJitterSeed } from './effects.js';
import type { Font, Glyph, Vec2 } from './types.js';

export type PositionedGlyph = {
  readonly glyph: Glyph; // already style-transformed (and effect-jittered)
  readonly origin: Vec2; // top-left of the glyph box in layout space
  readonly char: string;
  /** Running counter across the whole layout — feeds per-instance effects. */
  readonly instanceIndex: number;
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
  /** Horizontal alignment within the longest line's width. Default 'left'. */
  readonly align?: 'left' | 'center' | 'right';
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
  const kerning = font.kerning;
  const scaleX = font.style.scaleX;

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

  const splineJitter = font.style.effects?.splineJitter;
  let instanceIndex = 0;

  // Per-line buffers so we can apply alignment after measuring each line.
  type Pending = Omit<PositionedGlyph, 'origin'> & { x: number; y: number };
  const pendingByLine: Pending[][] = [];
  const lineWidths: number[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    let cursorX = 0;
    let prevChar = '';
    const y = li * lineStep;
    const buf: Pending[] = [];
    for (const ch of line) {
      if (ch === ' ') {
        cursorX += spaceW + tracking;
        prevChar = ch;
        continue;
      }
      const g = getGlyph(ch);
      if (!g) continue;
      // Typeface-wide kerning: previous char + current char as the pair key.
      if (prevChar && prevChar !== ' ' && kerning) {
        const k = kerning[prevChar + ch];
        if (k !== undefined) cursorX += k * scaleX;
      }
      const lsb = g.sidebearings?.left ?? 0;
      const rsb = g.sidebearings?.right ?? 0;
      const yOff = g.baselineOffset ?? 0;
      cursorX += lsb;
      const finalGlyph = jitterActive(splineJitter)
        ? jitterGlyphSpline(
            g,
            splineJitter,
            resolveJitterSeed(splineJitter, { instanceIndex, char: ch }, 0x5a17),
          )
        : g;
      buf.push({
        glyph: finalGlyph,
        x: cursorX,
        y: y + yOff,
        char: ch,
        instanceIndex,
      });
      cursorX += g.box.w + rsb + tracking;
      prevChar = ch;
      instanceIndex++;
    }
    pendingByLine.push(buf);
    lineWidths.push(cursorX);
    maxWidth = Math.max(maxWidth, cursorX);
  }

  // Apply alignment: each line gets shifted so it sits at left/center/right
  // of the layout's overall width (= longest line).
  const align = opts.align ?? 'left';
  for (let li = 0; li < pendingByLine.length; li++) {
    const lw = lineWidths[li]!;
    const dx =
      align === 'left' ? 0 :
      align === 'right' ? maxWidth - lw :
      (maxWidth - lw) / 2;
    for (const p of pendingByLine[li]!) {
      placed.push({
        glyph: p.glyph,
        origin: { x: p.x + dx, y: p.y },
        char: p.char,
        instanceIndex: p.instanceIndex,
      });
    }
  }

  return {
    glyphs: placed,
    width: maxWidth,
    height: lines.length * lineStep,
  };
}
