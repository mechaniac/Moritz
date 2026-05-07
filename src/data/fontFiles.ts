/**
 * Loads any font JSON files committed under `src/data/fonts/*.json` at
 * build/dev start. These act as repo-tracked overrides of the bundled
 * TS built-ins (defaultFont.ts, roundFont.ts), so the developer can iterate
 * on the system fonts directly in the app and have changes saved into the
 * repository via the dev plugin (see `vite.config.ts`).
 */

import type { Font } from '../core/types.js';
import type { GlyphViewOptions } from '../state/store.js';

export type FileFont = { font: Font; view?: GlyphViewOptions };

type Envelope = { format?: string; font?: Font; view?: GlyphViewOptions };

// Eagerly import every JSON in `fonts/`. Vite handles JSON natively.
const modules = import.meta.glob('./fonts/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

const byId: Record<string, FileFont> = {};
for (const [key, mod] of Object.entries(modules)) {
  const raw = (mod as { default: unknown }).default as Envelope | Font | null;
  if (!raw) continue;
  let font: Font | undefined;
  let view: GlyphViewOptions | undefined;
  if ((raw as Envelope).format === 'moritz-font' && (raw as Envelope).font) {
    font = (raw as Envelope).font;
    view = (raw as Envelope).view;
  } else if ((raw as Font).id && (raw as Font).glyphs && (raw as Font).style) {
    font = raw as Font;
  }
  if (!font) {
    console.warn(`[moritz] Skipping invalid font file ${key}`);
    continue;
  }
  byId[font.id] = view ? { font, view } : { font };
}

export const fileFontEnvelopes: Readonly<Record<string, FileFont>> = byId;

export const getFileFont = (id: string): FileFont | undefined => byId[id];
