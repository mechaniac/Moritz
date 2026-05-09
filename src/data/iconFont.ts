/**
 * Built-in icon "font" — same shape as `defaultFont` (a `Font` value), but
 * the glyph keys are short semantic names (`"save"`, `"load"`, …) rather
 * than printable characters. This lets us:
 *   1. Edit icons in the existing GlyphSetter (load this font, pick the
 *      icon by name, draw with the same spline tools as glyphs).
 *   2. Persist with the same Font envelope (`.moritz.json`) — icons are
 *      just another saved font.
 *   3. Render them anywhere via `<Icon name="save"/>` (see `src/ui/Icon.tsx`),
 *      which runs the standard outline pipeline at any pixel size.
 *
 * Each icon ships as an empty glyph in a 100×100 box. Open the icon font in
 * GlyphSetter and draw the strokes — exactly like designing a letter.
 */

import { constantWidth, v2, ZERO, type Font, type Glyph, type Vertex } from '../core/types.js';

const ICON_BOX = { w: 100, h: 100 };

const corner = (x: number, y: number): Vertex => ({
  p: v2(x, y),
  inHandle: ZERO,
  outHandle: ZERO,
});

let counter = 0;
const empty = (name: string): Glyph => ({
  char: name,
  box: ICON_BOX,
  // A single zero-length placeholder stroke so the outliner has something
  // to chew on; replace by drawing real strokes in GlyphSetter.
  strokes: [
    {
      id: `i${++counter}`,
      vertices: [corner(50, 40), corner(50, 60)],
    },
  ],
});

const ICON_NAMES = [
  'save',
  'load',
  'export',
  'import',
  'reset',
  'delete',
  'plus',
  'minus',
  'check',
  'close',
  'settings',
  'open-folder',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const iconNames: readonly IconName[] = ICON_NAMES;

export const iconFont: Font = {
  id: 'moritz-icons',
  name: 'Moritz Icons',
  style: {
    slant: 0,
    scaleX: 1,
    scaleY: 1,
    defaultWidth: constantWidth(8),
    widthOrientation: 'tangent',
    worldAngle: 0,
    capStart: 'round',
    capEnd: 'round',
    triMode: 'ribbon-density',
  },
  glyphs: Object.fromEntries(ICON_NAMES.map((n) => [n, empty(n)])),
};
