/** Registry of built-in fonts that ship with Moritz. */

import type { Font } from '../core/types.js';
import {
  deleteFont,
  loadFontEnvelope,
  type LoadedFont,
} from '../state/persistence.js';
import { defaultFont, withCommonGlyphFallback } from './defaultFont.js';
import { roundFont } from './roundFont.js';
import { getFileFont } from './fontFiles.js';

/** The bundled, never-mutated TS originals. */
const bundledFonts: readonly Font[] = [defaultFont, roundFont];

const builtInIds = new Set(bundledFonts.map((f) => f.id));

/**
 * The effective built-in for an id: a JSON override under
 * `src/data/fonts/<id>.json` (the developer's tracked edits) wins over
 * the bundled TS skeleton. This is how saved system-font edits become
 * the new baseline after a restart.
 */
const effectiveBuiltIn = (id: string): Font | undefined => {
  const file = getFileFont(id);
  if (file) return withCommonGlyphFallback(file.font);
  const bundled = bundledFonts.find((f) => f.id === id);
  return bundled ? withCommonGlyphFallback(bundled) : undefined;
};

/** All built-in fonts in their *current* (file-overridden) form. */
export const builtInFonts: readonly Font[] = bundledFonts.map(
  (f) => effectiveBuiltIn(f.id) ?? withCommonGlyphFallback(f),
);

export const isBuiltInId = (id: string): boolean => builtInIds.has(id);

/** Return the built-in font (and any saved view settings) for `id`.
 *
 *  Priority:
 *   - DEV: committed JSON file > localStorage override > bundled TS.
 *     The repo is the source of truth so external edits to the JSON are
 *     picked up on reload.
 *   - PROD: localStorage override > committed JSON file > bundled TS.
 *     No dev plugin, so user-side overrides still work.
 */
export const getBuiltInFont = (id: string): LoadedFont | undefined => {
  if (!builtInIds.has(id)) return undefined;
  const file = getFileFont(id);
  const local = loadFontEnvelope(id);
  const dev = !!import.meta.env?.DEV;
  const wrap = (lf: LoadedFont): LoadedFont => ({
    ...lf,
    font: withCommonGlyphFallback(lf.font),
  });
  if (dev) {
    if (file) return wrap(file);
    if (local) return wrap(local);
  } else {
    if (local) return wrap(local);
    if (file) return wrap(file);
  }
  const font = bundledFonts.find((f) => f.id === id);
  return font ? { font: withCommonGlyphFallback(font) } : undefined;
};

/** Drop any user override of a built-in font, restoring the bundled (or
 *  file-tracked) baseline. Note: only the localStorage override is removed
 *  here; the JSON file in `src/data/fonts/` (if any) stays put. */
export const resetBuiltInFont = (id: string): Font | undefined => {
  if (!builtInIds.has(id)) return undefined;
  deleteFont(id);
  return effectiveBuiltIn(id);
};

export { withCommonGlyphFallback };
