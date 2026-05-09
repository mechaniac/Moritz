/** Registry of built-in bubble fonts that ship with Moritz. */

import type { BubbleFont } from '../core/types.js';
import {
  deleteBubbleFont,
  loadBubbleFontEnvelope,
  type LoadedBubbleFont,
} from '../state/bubblePersistence.js';
import { defaultBubbleFont } from './defaultBubbleFont.js';
import { getFileBubbleFont } from './bubbleFontFiles.js';

const bundled: readonly BubbleFont[] = [defaultBubbleFont];
const builtInIds = new Set(bundled.map((f) => f.id));

const effectiveBuiltIn = (id: string): BubbleFont | undefined => {
  const file = getFileBubbleFont(id);
  if (file) return file.font;
  return bundled.find((f) => f.id === id);
};

export const builtInBubbleFonts: readonly BubbleFont[] = bundled.map(
  (f) => effectiveBuiltIn(f.id) ?? f,
);

export const isBuiltInBubbleId = (id: string): boolean => builtInIds.has(id);

export const getBuiltInBubbleFont = (
  id: string,
): LoadedBubbleFont | undefined => {
  if (!builtInIds.has(id)) return undefined;
  const file = getFileBubbleFont(id);
  const local = loadBubbleFontEnvelope(id);
  const dev = !!import.meta.env?.DEV;
  if (dev) {
    if (file) return file;
    if (local) return local;
  } else {
    if (local) return local;
    if (file) return file;
  }
  const font = bundled.find((f) => f.id === id);
  return font ? { font } : undefined;
};

export const resetBuiltInBubbleFont = (id: string): BubbleFont | undefined => {
  if (!builtInIds.has(id)) return undefined;
  deleteBubbleFont(id);
  return effectiveBuiltIn(id);
};
