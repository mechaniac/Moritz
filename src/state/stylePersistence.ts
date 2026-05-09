/**
 * Persistence for Style files. A Style is a universal, font-agnostic
 * `StyleSettings` payload (see `core/types.ts → Style`). It can be loaded
 * onto any font: changing the active style does not touch the loaded
 * font's glyph geometry.
 *
 * Wire-format mirrors `persistence.ts` for fonts: `localStorage` keys
 * `moritz.styles.<id>`, an index at `moritz.styles.index`, and a versioned
 * envelope. In dev, saves are also pushed to a tracked file under
 * `src/data/styles/<id>.json` via the dev plugin.
 */

import type { Style } from '../core/types.js';

const PREFIX = 'moritz.styles.';
const INDEX_KEY = 'moritz.styles.index';

export type StyleEnvelope = {
  readonly format: 'moritz-style';
  readonly version: 1;
  readonly style: Style;
};

export function listStyleIds(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseStored(raw: string): Style | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.format === 'moritz-style' && parsed.style) {
      return parsed.style as Style;
    }
    if (parsed && parsed.id && parsed.settings) {
      // Bare Style (no envelope).
      return parsed as Style;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadStyle(id: string): Style | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw);
}

export function saveStyle(style: Style): void {
  const env: StyleEnvelope = { format: 'moritz-style', version: 1, style };
  localStorage.setItem(PREFIX + style.id, JSON.stringify(env));
  const ids = new Set(listStyleIds());
  ids.add(style.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
  if (import.meta.env?.DEV) {
    void writeStyleFile(style.id, JSON.stringify(env, null, 2));
  }
}

export function deleteStyle(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listStyleIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

/** Dev-only write into `src/data/styles/<id>.json`. */
export async function writeStyleFile(id: string, body: string): Promise<void> {
  try {
    const res = await fetch(`/__moritz/styles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) console.warn(`[moritz] saving style ${id} to repo failed: ${res.status}`);
  } catch (err) {
    console.warn(`[moritz] saving style ${id} to repo failed`, err);
  }
}

export function exportStyleJson(style: Style): string {
  const env: StyleEnvelope = { format: 'moritz-style', version: 1, style };
  return JSON.stringify(env, null, 2);
}

export function importStyleJson(text: string): Style {
  const parsed = JSON.parse(text);
  if (parsed && parsed.format === 'moritz-style' && parsed.style) {
    return parsed.style as Style;
  }
  if (parsed && parsed.id && parsed.settings) {
    return parsed as Style;
  }
  throw new Error('Not a Moritz style file.');
}
