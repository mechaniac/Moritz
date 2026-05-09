/**
 * Persistence for Page files.
 *
 * Wire format
 * -----------
 *   - localStorage keys: `moritz.pages.<id>` plus an index
 *     `moritz.pages.index`.
 *   - Versioned envelope. v2 is canonical; v1 is read-only legacy.
 *     `loadPage` / `importPageJson` accept either; saves always emit v2.
 *   - In dev, saves are also pushed to `src/data/pages/<id>.json` via
 *     the dev plugin so the workspace doubles as the source of truth.
 *
 * Envelope shapes
 *   v1 (legacy):   { format: 'moritz-page', version: 1, page: LegacyPage }
 *   v2 (current):  { format: 'moritz-page', version: 2, page: Page }
 *
 * Loading a v1 envelope upgrades it on the fly via `legacyPageToPage`,
 * using the supplied `migrationLibrary` + `migrationRefs`. Callers
 * (PageBar) pass a snapshot of the active globals so the upgraded Page
 * is fully self-contained.
 *
 * Note: the background data URL can be very large (megabytes for a
 * comic page). localStorage has a per-origin quota of ~5MB; very large
 * pages may need to round-trip via download/upload (the file-folder
 * backend is the long-term plan).
 */

import {
  isCanonicalPage,
  isLegacyPage,
  legacyPageToPage,
} from '../core/page.js';
import type {
  LegacyPage,
  Page,
  PageLibrary,
} from '../core/types.js';

const PREFIX = 'moritz.pages.';
const INDEX_KEY = 'moritz.pages.index';

/** Hints used when upgrading a v1 envelope to the canonical v2 shape. */
export type MigrationContext = {
  readonly library: PageLibrary;
  readonly refs: {
    readonly fontId: string;
    readonly styleId: string;
    readonly bubbleFontId: string;
  };
};

export type PageEnvelopeV1 = {
  readonly format: 'moritz-page';
  readonly version: 1;
  readonly page: LegacyPage;
};

export type PageEnvelopeV2 = {
  readonly format: 'moritz-page';
  readonly version: 2;
  readonly page: Page;
};

export type PageEnvelope = PageEnvelopeV1 | PageEnvelopeV2;

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

/** Parse stored JSON and upgrade to the canonical Page shape. */
function parseStored(raw: string, ctx: MigrationContext): Page | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parsedToPage(parsed, ctx);
}

function parsedToPage(parsed: unknown, ctx: MigrationContext): Page | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const env = parsed as { format?: string; version?: number; page?: unknown };

  // Versioned envelope.
  if (env.format === 'moritz-page' && env.page) {
    if (env.version === 2 && isCanonicalPage(env.page)) {
      return env.page;
    }
    if (env.version === 1 && isLegacyPage(env.page)) {
      return legacyPageToPage(env.page, ctx.library, ctx.refs);
    }
    // Unknown version: try to sniff the inner shape.
    if (isCanonicalPage(env.page)) return env.page;
    if (isLegacyPage(env.page)) return legacyPageToPage(env.page, ctx.library, ctx.refs);
    return null;
  }

  // Bare (envelope-less) page object — pre-envelope saves.
  if (isCanonicalPage(parsed)) return parsed;
  if (isLegacyPage(parsed)) return legacyPageToPage(parsed, ctx.library, ctx.refs);
  return null;
}

export function loadPage(id: string, ctx: MigrationContext): Page | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw, ctx);
}

export function savePage(page: Page): void {
  const env: PageEnvelopeV2 = { format: 'moritz-page', version: 2, page };
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
  const env: PageEnvelopeV2 = { format: 'moritz-page', version: 2, page };
  return JSON.stringify(env, null, 2);
}

export function importPageJson(text: string, ctx: MigrationContext): Page {
  const parsed = JSON.parse(text);
  const page = parsedToPage(parsed, ctx);
  if (!page) throw new Error('Not a Moritz page file.');
  return page;
}
