/** Registry of built-in `Style`s. Mirrors `builtInFonts.ts` for fonts. */

import type { Style } from '../core/types.js';
import { defaultFont } from './defaultFont.js';
import { roundFont } from './roundFont.js';
import { loadStyle, deleteStyle } from '../state/stylePersistence.js';

/**
 * Built-in styles are derived from the bundled fonts' `style` field — for
 * back-compat the canonical style payload still ships baked into the
 * font, and we expose it here as a separate, font-agnostic Style that the
 * user can apply to any font.
 */
export const defaultStyle: Style = {
  id: 'default',
  name: 'Default',
  settings: defaultFont.style,
};

export const roundStyle: Style = {
  id: 'round',
  name: 'Round',
  settings: roundFont.style,
};

const bundledStyles: readonly Style[] = [defaultStyle, roundStyle];
const builtInIds = new Set(bundledStyles.map((s) => s.id));

export const builtInStyles: readonly Style[] = bundledStyles;
export const isBuiltInStyleId = (id: string): boolean => builtInIds.has(id);

/** Loaded style for `id`, with localStorage overrides taking priority. */
export const getBuiltInStyle = (id: string): Style | undefined => {
  if (!builtInIds.has(id)) return undefined;
  const local = loadStyle(id);
  if (local) return local;
  return bundledStyles.find((s) => s.id === id);
};

/** Drop the local override, returning to the bundled baseline. */
export const resetBuiltInStyle = (id: string): Style | undefined => {
  if (!builtInIds.has(id)) return undefined;
  deleteStyle(id);
  return bundledStyles.find((s) => s.id === id);
};
