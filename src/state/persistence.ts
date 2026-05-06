/**
 * Persistence for fonts. localStorage-backed, with JSON import/export.
 *
 * Wire-format note: a `Font` is plain JSON; we don't add a custom codec.
 * The envelope optionally carries the user's interface settings
 * (`view`: `GlyphViewOptions`) alongside the font, kept structurally
 * separate so the `Font` itself stays a pure typeface description.
 */

import type { Font } from '../core/types.js';
import type { GlyphViewOptions } from './store.js';

const PREFIX = 'moritz.fonts.';
const INDEX_KEY = 'moritz.fonts.index';

export type FontEnvelope = {
  readonly format: 'moritz-font';
  readonly version: 2;
  readonly font: Font;
  /** Optional UI / view settings captured at save time. The Font itself
   *  is unaware of this — it lives next to it in the envelope. */
  readonly view?: GlyphViewOptions;
};

export type LoadedFont = { font: Font; view?: GlyphViewOptions };

export function listFontIds(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Parse a stored payload into `{font, view?}`. Accepts both v2 envelopes
 *  and bare `Font` records (as written by older builds). */
function parseStored(raw: string): LoadedFont | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.format === 'moritz-font' && parsed.font) {
      return { font: parsed.font as Font, view: parsed.view as GlyphViewOptions | undefined };
    }
    if (parsed && parsed.id && parsed.glyphs && parsed.style) {
      return { font: parsed as Font };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadFont(id: string): Font | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw)?.font ?? null;
}

export function loadFontEnvelope(id: string): LoadedFont | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw);
}

export function saveFont(font: Font, view?: GlyphViewOptions): void {
  const env: FontEnvelope = { format: 'moritz-font', version: 2, font, view };
  localStorage.setItem(PREFIX + font.id, JSON.stringify(env));
  const ids = new Set(listFontIds());
  ids.add(font.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
}

export function deleteFont(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listFontIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function exportFontJson(font: Font, view?: GlyphViewOptions): string {
  const env: FontEnvelope = { format: 'moritz-font', version: 2, font, view };
  return JSON.stringify(env, null, 2);
}

export function importFontJson(text: string): LoadedFont {
  const parsed = JSON.parse(text);
  if (parsed && parsed.format === 'moritz-font' && parsed.font) {
    return { font: parsed.font as Font, view: parsed.view as GlyphViewOptions | undefined };
  }
  if (parsed && parsed.id && parsed.glyphs && parsed.style) {
    return { font: parsed as Font };
  }
  throw new Error('Not a Moritz font file.');
}

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
