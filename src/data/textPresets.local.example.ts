/**
 * Per-developer local text presets — NOT committed to git.
 *
 * To enable: copy this file to `textPresets.local.ts` (in the same folder)
 * and edit. The file is gitignored so anything you put here stays on
 * your machine. Useful for keeping personal reference snippets you've
 * typed up once and don't want to retype every time you tweak a glyph.
 *
 * Format: an array of `TextPresetSet`. They're appended after the
 * built-in sets in the dropdown. Labels are auto-derived from the first
 * two words of each preset's text — see `presetLabelFromText`.
 *
 * Example:
 *
 *   import type { TextPresetSet } from './textPresets.js';
 *   import { presetLabelFromText } from './textPresets.js';
 *
 *   const p = (text: string) => ({ label: presetLabelFromText(text), text });
 *
 *   const myReference: TextPresetSet = {
 *     id: 'my-reference',
 *     name: 'My reference',
 *     bubbles: [
 *       p('SOME TEXT\nYOU LIKE\nTO TEST WITH'),
 *       p('ANOTHER ONE!'),
 *     ],
 *   };
 *
 *   export default [myReference];
 */

import type { TextPresetSet } from './textPresets.js';

const sets: TextPresetSet[] = [];

export default sets;
