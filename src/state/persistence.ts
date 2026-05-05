/**
 * Persistence for fonts. localStorage-backed, with JSON import/export.
 *
 * Wire-format note: a `Font` is plain JSON; we don't add a custom codec.
 * We do tag exports with a small envelope so future versions can migrate.
 */

import type { Font } from '../core/types.js';

const PREFIX = 'moritz.fonts.';
const INDEX_KEY = 'moritz.fonts.index';

export type FontEnvelope = {
  readonly format: 'moritz-font';
  readonly version: 1;
  readonly font: Font;
};

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

export function loadFont(id: string): Font | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as Font;
  } catch {
    return null;
  }
}

export function saveFont(font: Font): void {
  localStorage.setItem(PREFIX + font.id, JSON.stringify(font));
  const ids = new Set(listFontIds());
  ids.add(font.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
}

export function deleteFont(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listFontIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function exportFontJson(font: Font): string {
  const env: FontEnvelope = { format: 'moritz-font', version: 1, font };
  return JSON.stringify(env, null, 2);
}

export function importFontJson(text: string): Font {
  const parsed = JSON.parse(text);
  // Accept both raw `Font` and envelope.
  if (parsed && parsed.format === 'moritz-font' && parsed.font) {
    return parsed.font as Font;
  }
  if (parsed && parsed.id && parsed.glyphs && parsed.style) {
    return parsed as Font;
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
