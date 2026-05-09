/**
 * Loads any bubble-font JSON files committed under
 * `src/data/bubbles/*.json` at build/dev start. These act as repo-tracked
 * overrides of the bundled TS built-in (defaultBubbleFont.ts), mirroring
 * the pattern used for fonts in `fontFiles.ts`.
 */

import type { BubbleFont } from '../core/types.js';
import type { BubbleViewOptions } from '../state/bubbleStore.js';

export type FileBubbleFont = { font: BubbleFont; view?: BubbleViewOptions };

type Envelope = {
  format?: string;
  font?: BubbleFont;
  view?: BubbleViewOptions;
};

const modules = import.meta.glob('./bubbles/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

const byId: Record<string, FileBubbleFont> = {};
for (const [key, mod] of Object.entries(modules)) {
  const raw = (mod as { default: unknown }).default as
    | Envelope
    | BubbleFont
    | null;
  if (!raw) continue;
  let font: BubbleFont | undefined;
  let view: BubbleViewOptions | undefined;
  if (
    (raw as Envelope).format === 'moritz-bubble-font' &&
    (raw as Envelope).font
  ) {
    font = (raw as Envelope).font;
    view = (raw as Envelope).view;
  } else if (
    (raw as BubbleFont).id &&
    (raw as BubbleFont).bubbles &&
    (raw as BubbleFont).style
  ) {
    font = raw as BubbleFont;
  }
  if (!font) {
    console.warn(`[moritz] Skipping invalid bubble file ${key}`);
    continue;
  }
  byId[font.id] = view ? { font, view } : { font };
}

export const fileBubbleFontEnvelopes: Readonly<Record<string, FileBubbleFont>> =
  byId;

export const getFileBubbleFont = (id: string): FileBubbleFont | undefined =>
  byId[id];
