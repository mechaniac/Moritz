/** Registry of built-in fonts that ship with Moritz. */

import type { Font } from '../core/types.js';
import { defaultFont } from './defaultFont.js';
import { roundFont } from './roundFont.js';

export const builtInFonts: readonly Font[] = [defaultFont, roundFont];

export const getBuiltInFont = (id: string): Font | undefined =>
  builtInFonts.find((f) => f.id === id);
