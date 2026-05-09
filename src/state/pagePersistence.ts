/**
 * Persistence for Page files. A Page is a TypeSetter scene: page size,
 * background image (optional), and the placed text blocks.
 *
 * Wire-format: `localStorage` keys `moritz.pages.<id>`, an index at
 * `moritz.pages.index`, and a versioned envelope. In dev, saves are also
 * pushed to `src/data/pages/<id>.json` via the dev plugin.
 *
 * Note: the background data URL can be very large (megabytes for a comic
 * page). localStorage has a per-origin quota of ~5MB; very large pages
 * may need to round-trip via download/upload (the file-folder backend
 * is the long-term plan).
 */

import type { Page } from '../core/types.js';

const PREFIX = 'moritz.pages.';
const INDEX_KEY = 'moritz.pages.index';

export type PageEnvelope = {
  readonly format: 'moritz-page';
  readonly version: 1;
  readonly page: Page;
};

export function listPageIds(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseStored(raw: string): Page | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.format === 'moritz-page' && parsed.page) {
      return parsed.page as Page;
    }
    if (parsed && parsed.id && parsed.blocks) {
      return parsed as Page;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadPage(id: string): Page | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw);
}

export function savePage(page: Page): void {
  const env: PageEnvelope = { format: 'moritz-page', version: 1, page };
  try {
    localStorage.setItem(PREFIX + page.id, JSON.stringify(env));
    const ids = new Set(listPageIds());
    ids.add(page.id);
    localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
  } catch (err) {
    // Most likely QuotaExceededError due to a large background image.
    console.error('[moritz] saving page to localStorage failed', err);
    throw err;
  }
  if (import.meta.env?.DEV) {
    void writePageFile(page.id, JSON.stringify(env, null, 2));
  }
}

export function deletePage(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listPageIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export async function writePageFile(id: string, body: string): Promise<void> {
  try {
    const res = await fetch(`/__moritz/pages/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) console.warn(`[moritz] saving page ${id} to repo failed: ${res.status}`);
  } catch (err) {
    console.warn(`[moritz] saving page ${id} to repo failed`, err);
  }
}

export function exportPageJson(page: Page): string {
  const env: PageEnvelope = { format: 'moritz-page', version: 1, page };
  return JSON.stringify(env, null, 2);
}

export function importPageJson(text: string): Page {
  const parsed = JSON.parse(text);
  if (parsed && parsed.format === 'moritz-page' && parsed.page) {
    return parsed.page as Page;
  }
  if (parsed && parsed.id && parsed.blocks) {
    return parsed as Page;
  }
  throw new Error('Not a Moritz page file.');
}
