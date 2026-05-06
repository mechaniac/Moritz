/** Registry of built-in fonts that ship with Moritz. */

import type { Font } from '../core/types.js';
import { deleteFont, loadFont } from '../state/persistence.js';
import { defaultFont } from './defaultFont.js';
import { roundFont } from './roundFont.js';

/** The bundled, never-mutated originals. */
export const builtInFonts: readonly Font[] = [defaultFont, roundFont];

const builtInIds = new Set(builtInFonts.map((f) => f.id));

export const isBuiltInId = (id: string): boolean => builtInIds.has(id);

/** Return the built-in font for `id`. If the user has saved an override
 *  under the same id, the override wins (so edits to a base font persist
 *  across reloads via the same Save mechanism as user fonts). */
export const getBuiltInFont = (id: string): Font | undefined => {
  if (!builtInIds.has(id)) return undefined;
  const overridden = loadFont(id);
  if (overridden) return overridden;
  return builtInFonts.find((f) => f.id === id);
};

/** Drop any user override of a built-in font, restoring the bundled original. */
export const resetBuiltInFont = (id: string): Font | undefined => {
  if (!builtInIds.has(id)) return undefined;
  deleteFont(id);
  return builtInFonts.find((f) => f.id === id);
};
