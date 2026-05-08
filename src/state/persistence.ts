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
  const json = JSON.stringify(env);
  localStorage.setItem(PREFIX + font.id, json);
  const ids = new Set(listFontIds());
  ids.add(font.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
  // In dev, also persist the envelope into the repo via the Vite plugin
  // (`src/data/fonts/<id>.json`). On reload it becomes the new baseline
  // for built-ins, so edits to the system fonts are version-controlled.
  if (import.meta.env?.DEV) {
    void writeFontFile(font.id, JSON.stringify(env, null, 2));
  }
}

export function deleteFont(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listFontIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

/**
 * Dev-only: PUT the JSON to the dev plugin so it gets written to
 * `src/data/fonts/<id>.json`. Failures are logged but never thrown — the
 * UI keeps working from localStorage if the plugin isn't reachable.
 * Exported so callers (e.g. Export button) can mirror downloads into
 * the repo's tracked font folder during development.
 */
export async function writeFontFile(id: string, body: string): Promise<void> {
  try {
    const res = await fetch(`/__moritz/fonts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) console.warn(`[moritz] saving font ${id} to repo failed: ${res.status}`);
  } catch (err) {
    console.warn(`[moritz] saving font ${id} to repo failed`, err);
  }
}

/**
 * One-shot migration: in dev, for each id given, if there's a localStorage
 * override but no committed file yet, push the localStorage envelope to the
 * dev plugin. Captures the developer's existing browser-edited fonts into
 * the repo on first run after this feature was added.
 */
export async function syncLocalOverridesToRepo(
  ids: readonly string[],
  hasFile: (id: string) => boolean,
): Promise<void> {
  if (!import.meta.env?.DEV) return;
  for (const id of ids) {
    if (hasFile(id)) continue;
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) continue;
    const parsed = parseStored(raw);
    if (!parsed) continue;
    const env: FontEnvelope = {
      format: 'moritz-font',
      version: 2,
      font: parsed.font,
      view: parsed.view,
    };
    await writeFontFile(id, JSON.stringify(env, null, 2));
  }
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
