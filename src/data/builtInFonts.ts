/** Registry of built-in fonts that ship with Moritz. */

import type { Font } from '../core/types.js';
import {
  deleteFont,
  loadFontEnvelope,
  type LoadedFont,
} from '../state/persistence.js';
import { defaultFont } from './defaultFont.js';
import { roundFont } from './roundFont.js';

/** The bundled, never-mutated originals. */
export const builtInFonts: readonly Font[] = [defaultFont, roundFont];

const builtInIds = new Set(builtInFonts.map((f) => f.id));

export const isBuiltInId = (id: string): boolean => builtInIds.has(id);

/** Return the built-in font (and any saved view settings) for `id`. If
 *  the user has saved an override under the same id, the override wins. */
export const getBuiltInFont = (id: string): LoadedFont | undefined => {
  if (!builtInIds.has(id)) return undefined;
  const overridden = loadFontEnvelope(id);
  if (overridden) return overridden;
  const font = builtInFonts.find((f) => f.id === id);
  return font ? { font } : undefined;
};

/** Drop any user override of a built-in font, restoring the bundled original. */
export const resetBuiltInFont = (id: string): Font | undefined => {
  if (!builtInIds.has(id)) return undefined;
  deleteFont(id);
  return builtInFonts.find((f) => f.id === id);
};
