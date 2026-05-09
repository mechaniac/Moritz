/**
 * Persistence for BubbleFonts. A BubbleFont is structurally a `Font` but
 * with `bubbles: Record<string, Bubble>` instead of `glyphs`. Same wire
 * format pattern as `persistence.ts` (fonts) and `stylePersistence.ts`
 * (styles): `localStorage` keys `moritz.bubbles.<id>`, an index at
 * `moritz.bubbles.index`, and a versioned envelope. In dev, saves are
 * also pushed to a tracked file under `src/data/bubbles/<id>.json` via
 * the dev plugin in `vite.config.ts`.
 */

import type { BubbleFont } from '../core/types.js';
import type { BubbleViewOptions } from './bubbleStore.js';

const PREFIX = 'moritz.bubbles.';
const INDEX_KEY = 'moritz.bubbles.index';

export type BubbleFontEnvelope = {
  readonly format: 'moritz-bubble-font';
  readonly version: 1;
  readonly font: BubbleFont;
  /** Optional UI / view settings captured at save time. */
  readonly view?: BubbleViewOptions;
};

export type LoadedBubbleFont = {
  font: BubbleFont;
  view?: BubbleViewOptions;
};

/**
 * Strip session-only fields from a `BubbleViewOptions` before saving.
 * Today: zoom + pan (per-session ergonomic, not part of the font).
 */
function stripSessionView(
  view?: BubbleViewOptions,
): BubbleViewOptions | undefined {
  if (!view) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { editorScale: _z, panX: _x, panY: _y, ...rest } = view;
  return rest as BubbleViewOptions;
}

export function listBubbleFontIds(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseStored(raw: string): LoadedBubbleFont | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.format === 'moritz-bubble-font' &&
      parsed.font
    ) {
      return {
        font: parsed.font as BubbleFont,
        view: parsed.view as BubbleViewOptions | undefined,
      };
    }
    if (parsed && parsed.id && parsed.bubbles && parsed.style) {
      return { font: parsed as BubbleFont };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadBubbleFont(id: string): BubbleFont | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw)?.font ?? null;
}

export function loadBubbleFontEnvelope(
  id: string,
): LoadedBubbleFont | null {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return null;
  return parseStored(raw);
}

export function saveBubbleFont(
  font: BubbleFont,
  view?: BubbleViewOptions,
): void {
  const env: BubbleFontEnvelope = {
    format: 'moritz-bubble-font',
    version: 1,
    font,
    view: stripSessionView(view),
  };
  const json = JSON.stringify(env);
  localStorage.setItem(PREFIX + font.id, json);
  const ids = new Set(listBubbleFontIds());
  ids.add(font.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([...ids]));
  if (import.meta.env?.DEV) {
    void writeBubbleFontFile(font.id, JSON.stringify(env, null, 2));
  }
}

export function deleteBubbleFont(id: string): void {
  localStorage.removeItem(PREFIX + id);
  const ids = listBubbleFontIds().filter((x) => x !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

/** Dev-only write into `src/data/bubbles/<id>.json`. */
export async function writeBubbleFontFile(
  id: string,
  body: string,
): Promise<void> {
  try {
    const res = await fetch(
      `/__moritz/bubbles/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    if (!res.ok)
      console.warn(
        `[moritz] saving bubble font ${id} to repo failed: ${res.status}`,
      );
  } catch (err) {
    console.warn(
      `[moritz] saving bubble font ${id} to repo failed`,
      err,
    );
  }
}

export function exportBubbleFontJson(
  font: BubbleFont,
  view?: BubbleViewOptions,
): string {
  const env: BubbleFontEnvelope = {
    format: 'moritz-bubble-font',
    version: 1,
    font,
    view: stripSessionView(view),
  };
  return JSON.stringify(env, null, 2);
}

export function importBubbleFontJson(text: string): LoadedBubbleFont {
  const parsed = JSON.parse(text);
  if (
    parsed &&
    parsed.format === 'moritz-bubble-font' &&
    parsed.font
  ) {
    return {
      font: parsed.font as BubbleFont,
      view: parsed.view as BubbleViewOptions | undefined,
    };
  }
  if (parsed && parsed.id && parsed.bubbles && parsed.style) {
    return { font: parsed as BubbleFont };
  }
  throw new Error('Not a Moritz bubble-font file.');
}
