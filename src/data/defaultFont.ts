/**
 * Built-in base font for Moritz. Intentionally minimal: clean stroke skeletons
 * for the most common glyphs. Designed in a 100×140 box (w×h).
 *
 * All anchors use ZERO handles (corner anchors). The stroke outliner produces
 * smooth shapes; future versions will add curved handles per-glyph for
 * authentic comic-book personality.
 *
 * Coordinates: y grows DOWNWARD. (0,0) is the top-left of the glyph box.
 */

import {
  constantWidth,
  v2,
  ZERO,
  type Font,
  type Glyph,
  type Stroke,
  type Vertex,
} from '../core/types.js';

const BOX_W = 100; // standard glyph width
const BOX_H = 140; // standard glyph height (incl. ascender/descender room)
const BASELINE = 110; // y position used as visual baseline for caps height
const CAP = 25; // top of caps

const corner = (x: number, y: number): Vertex => ({
  p: v2(x, y),
  inHandle: ZERO,
  outHandle: ZERO,
});

let strokeCounter = 0;

// Open-stroke invariant: every stroke must have a distinct start and end
// (a real pen path with touch-down and lift-off). Throws on closed loops
// instead of silently producing a degenerate self-touching outline.
const stroke = (vertices: Vertex[]): Stroke => {
  if (vertices.length >= 2) {
    const a = vertices[0]!.p;
    const z = vertices[vertices.length - 1]!.p;
    if (a.x === z.x && a.y === z.y) {
      throw new Error(
        'defaultFont stroke is closed (first.p === last.p). Strokes must have a distinct start and end — leave a small pen-lift gap.',
      );
    }
  }
  return { id: `s${++strokeCounter}`, vertices };
};

const glyph = (
  char: string,
  strokes: Stroke[],
  box: { w: number; h: number } = { w: BOX_W, h: BOX_H },
): Glyph => ({ char, box, strokes });

// ---------- Glyphs ----------------------------------------------------------

const A: Glyph = glyph('A', [
  stroke([corner(10, BASELINE), corner(50, CAP)]),
  stroke([corner(50, CAP), corner(90, BASELINE)]),
  stroke([corner(25, BASELINE - 35), corner(75, BASELINE - 35)]),
]);

const B: Glyph = glyph('B', [
  stroke([corner(20, BASELINE), corner(20, CAP)]),
  stroke([
    corner(20, CAP),
    corner(70, CAP),
    corner(80, BASELINE - 60),
    corner(70, BASELINE - 45),
    corner(20, BASELINE - 45),
  ]),
  stroke([
    corner(20, BASELINE - 45),
    corner(75, BASELINE - 45),
    corner(85, BASELINE - 22),
    corner(75, BASELINE),
    corner(20, BASELINE),
  ]),
]);

const C: Glyph = glyph('C', [
  stroke([
    corner(85, CAP + 10),
    corner(50, CAP),
    corner(15, CAP + 25),
    corner(15, BASELINE - 25),
    corner(50, BASELINE),
    corner(85, BASELINE - 10),
  ]),
]);

const D: Glyph = glyph('D', [
  stroke([corner(20, BASELINE), corner(20, CAP)]),
  stroke([
    corner(20, CAP),
    corner(60, CAP),
    corner(85, CAP + 25),
    corner(85, BASELINE - 25),
    corner(60, BASELINE),
    corner(20, BASELINE),
  ]),
]);

const E: Glyph = glyph('E', [
  stroke([corner(20, CAP), corner(20, BASELINE)]),
  stroke([corner(20, CAP), corner(85, CAP)]),
  stroke([corner(20, BASELINE - 45), corner(70, BASELINE - 45)]),
  stroke([corner(20, BASELINE), corner(85, BASELINE)]),
]);

const F: Glyph = glyph('F', [
  stroke([corner(20, CAP), corner(20, BASELINE)]),
  stroke([corner(20, CAP), corner(85, CAP)]),
  stroke([corner(20, BASELINE - 45), corner(70, BASELINE - 45)]),
]);

const G: Glyph = glyph('G', [
  stroke([
    corner(85, CAP + 10),
    corner(50, CAP),
    corner(15, CAP + 25),
    corner(15, BASELINE - 25),
    corner(50, BASELINE),
    corner(85, BASELINE - 15),
    corner(85, BASELINE - 50),
    corner(60, BASELINE - 50),
  ]),
]);

const H: Glyph = glyph('H', [
  stroke([corner(20, CAP), corner(20, BASELINE)]),
  stroke([corner(80, CAP), corner(80, BASELINE)]),
  stroke([corner(20, (CAP + BASELINE) / 2), corner(80, (CAP + BASELINE) / 2)]),
]);

const I: Glyph = glyph(
  'I',
  [stroke([corner(30, CAP), corner(30, BASELINE)])],
  { w: 60, h: BOX_H },
);

const J: Glyph = glyph(
  'J',
  [
    stroke([
      corner(70, CAP),
      corner(70, BASELINE - 20),
      corner(50, BASELINE),
      corner(25, BASELINE - 15),
    ]),
  ],
  { w: 90, h: BOX_H },
);

const K: Glyph = glyph('K', [
  stroke([corner(20, CAP), corner(20, BASELINE)]),
  stroke([corner(80, CAP), corner(20, (CAP + BASELINE) / 2)]),
  stroke([corner(20, (CAP + BASELINE) / 2), corner(85, BASELINE)]),
]);

const L: Glyph = glyph('L', [
  stroke([corner(20, CAP), corner(20, BASELINE), corner(80, BASELINE)]),
]);

const M: Glyph = glyph(
  'M',
  [
    stroke([
      corner(15, BASELINE),
      corner(15, CAP),
      corner(55, BASELINE - 25),
      corner(95, CAP),
      corner(95, BASELINE),
    ]),
  ],
  { w: 110, h: BOX_H },
);

const N: Glyph = glyph('N', [
  stroke([
    corner(20, BASELINE),
    corner(20, CAP),
    corner(80, BASELINE),
    corner(80, CAP),
  ]),
]);

// O: hex outline drawn as an open stroke. Start sits 1 unit right of the
// top apex, end sits 1 unit left — the round caps cover the gap so the
// loop visually closes while the geometry stays a true pen path.
const O: Glyph = glyph('O', [
  stroke([
    corner(51, CAP),
    corner(85, CAP + 25),
    corner(85, BASELINE - 25),
    corner(50, BASELINE),
    corner(15, BASELINE - 25),
    corner(15, CAP + 25),
    corner(49, CAP),
  ]),
]);

const P: Glyph = glyph('P', [
  stroke([corner(20, BASELINE), corner(20, CAP)]),
  stroke([
    corner(20, CAP),
    corner(70, CAP),
    corner(85, CAP + 22),
    corner(70, BASELINE - 50),
    corner(20, BASELINE - 50),
  ]),
]);

const Q: Glyph = glyph('Q', [
  stroke([
    corner(51, CAP),
    corner(85, CAP + 25),
    corner(85, BASELINE - 25),
    corner(50, BASELINE),
    corner(15, BASELINE - 25),
    corner(15, CAP + 25),
    corner(49, CAP),
  ]),
  stroke([corner(60, BASELINE - 20), corner(95, BASELINE + 10)]),
]);

const R: Glyph = glyph('R', [
  stroke([corner(20, BASELINE), corner(20, CAP)]),
  stroke([
    corner(20, CAP),
    corner(70, CAP),
    corner(85, CAP + 22),
    corner(70, BASELINE - 50),
    corner(20, BASELINE - 50),
  ]),
  stroke([corner(50, BASELINE - 50), corner(85, BASELINE)]),
]);

const S: Glyph = glyph('S', [
  stroke([
    corner(85, CAP + 10),
    corner(50, CAP),
    corner(20, CAP + 18),
    corner(20, CAP + 40),
    corner(80, BASELINE - 35),
    corner(80, BASELINE - 15),
    corner(50, BASELINE),
    corner(15, BASELINE - 10),
  ]),
]);

const T: Glyph = glyph('T', [
  stroke([corner(15, CAP), corner(85, CAP)]),
  stroke([corner(50, CAP), corner(50, BASELINE)]),
]);

const U: Glyph = glyph('U', [
  stroke([
    corner(20, CAP),
    corner(20, BASELINE - 25),
    corner(50, BASELINE),
    corner(80, BASELINE - 25),
    corner(80, CAP),
  ]),
]);

const V: Glyph = glyph('V', [
  stroke([corner(15, CAP), corner(50, BASELINE), corner(85, CAP)]),
]);

const W: Glyph = glyph(
  'W',
  [
    stroke([
      corner(10, CAP),
      corner(35, BASELINE),
      corner(60, CAP + 30),
      corner(85, BASELINE),
      corner(110, CAP),
    ]),
  ],
  { w: 120, h: BOX_H },
);

const X: Glyph = glyph('X', [
  stroke([corner(15, CAP), corner(85, BASELINE)]),
  stroke([corner(85, CAP), corner(15, BASELINE)]),
]);

const Y: Glyph = glyph('Y', [
  stroke([corner(15, CAP), corner(50, BASELINE - 40)]),
  stroke([corner(85, CAP), corner(50, BASELINE - 40)]),
  stroke([corner(50, BASELINE - 40), corner(50, BASELINE)]),
]);

const Z: Glyph = glyph('Z', [
  stroke([
    corner(15, CAP),
    corner(85, CAP),
    corner(15, BASELINE),
    corner(85, BASELINE),
  ]),
]);

// ---------- Lowercase (comic-style small caps) -----------------------------
// Traditional comic lettering uses all caps; lowercase keys map to scaled-down
// versions of the uppercase forms that sit on the x-height line.

const XHEIGHT = BASELINE - 55; // top of lowercase letters (y=55)

/** Scale an uppercase glyph's strokes down to the x-height band, and shrink
 *  the box width to match so lowercase advances are tighter than uppercase
 *  (otherwise every lowercase inherits the parent's full box and lines look
 *  uniformly spaced). */
const smallCap = (lower: string, src: Glyph): Glyph => {
  const sy = (BASELINE - XHEIGHT) / (BASELINE - CAP); // height ratio
  const sx = sy; // keep proportions
  const newW = src.box.w * sx;
  const scaledStrokes: Stroke[] = src.strokes.map((s) => ({
    id: `s${++strokeCounter}`,
    vertices: s.vertices.map((v) => ({
      p: v2(
        v.p.x * sx,
        BASELINE - (BASELINE - v.p.y) * sy,
      ),
      inHandle: v2(v.inHandle.x * sx, v.inHandle.y * sy),
      outHandle: v2(v.outHandle.x * sx, v.outHandle.y * sy),
    })),
  }));
  return { char: lower, box: { w: Math.round(newW), h: src.box.h }, strokes: scaledStrokes };
};

const lowercase: Glyph[] = [
  smallCap('a', A), smallCap('b', B), smallCap('c', C), smallCap('d', D),
  smallCap('e', E), smallCap('f', F), smallCap('g', G), smallCap('h', H),
  smallCap('i', I), smallCap('j', J), smallCap('k', K), smallCap('l', L),
  smallCap('m', M), smallCap('n', N), smallCap('o', O), smallCap('p', P),
  smallCap('q', Q), smallCap('r', R), smallCap('s', S), smallCap('t', T),
  smallCap('u', U), smallCap('v', V), smallCap('w', W), smallCap('x', X),
  smallCap('y', Y), smallCap('z', Z),
];

// ---------- Digits ----------------------------------------------------------

const N0: Glyph = glyph('0', [
  stroke([
    corner(51, CAP),
    corner(85, CAP + 25),
    corner(85, BASELINE - 25),
    corner(50, BASELINE),
    corner(15, BASELINE - 25),
    corner(15, CAP + 25),
    corner(49, CAP),
  ]),
]);

const N1: Glyph = glyph(
  '1',
  [
    stroke([corner(30, CAP + 15), corner(50, CAP), corner(50, BASELINE)]),
    stroke([corner(25, BASELINE), corner(75, BASELINE)]),
  ],
  { w: 70, h: BOX_H },
);

const N2: Glyph = glyph('2', [
  stroke([
    corner(15, CAP + 15),
    corner(50, CAP),
    corner(85, CAP + 20),
    corner(60, CAP + 45),
    corner(15, BASELINE),
    corner(85, BASELINE),
  ]),
]);

const N3: Glyph = glyph('3', [
  stroke([
    corner(15, CAP + 10),
    corner(50, CAP),
    corner(85, CAP + 20),
    corner(45, (CAP + BASELINE) / 2),
    corner(85, BASELINE - 25),
    corner(50, BASELINE),
    corner(15, BASELINE - 15),
  ]),
]);

const N4: Glyph = glyph('4', [
  stroke([corner(70, CAP), corner(15, BASELINE - 35), corner(85, BASELINE - 35)]),
  stroke([corner(70, CAP + 20), corner(70, BASELINE)]),
]);

const N5: Glyph = glyph('5', [
  stroke([
    corner(80, CAP),
    corner(20, CAP),
    corner(20, (CAP + BASELINE) / 2),
    corner(55, (CAP + BASELINE) / 2 - 5),
    corner(85, BASELINE - 30),
    corner(60, BASELINE),
    corner(15, BASELINE - 15),
  ]),
]);

const N6: Glyph = glyph('6', [
  stroke([
    corner(75, CAP + 5),
    corner(35, CAP + 25),
    corner(15, BASELINE - 30),
    corner(40, BASELINE),
    corner(80, BASELINE - 20),
    corner(70, BASELINE - 45),
    corner(25, BASELINE - 40),
  ]),
]);

const N7: Glyph = glyph('7', [
  stroke([corner(15, CAP), corner(85, CAP), corner(40, BASELINE)]),
]);

// 8: open figure-eight — starts just left of the midpoint, traces top
// loop, midpoint, bottom loop, ends just right of the midpoint. Caps
// cover the 2-unit gap.
const N8: Glyph = glyph('8', [
  stroke([
    corner(49, CAP + 35),
    corner(20, CAP + 18),
    corner(50, CAP),
    corner(80, CAP + 18),
    corner(50, CAP + 35),
    corner(85, BASELINE - 18),
    corner(50, BASELINE),
    corner(15, BASELINE - 18),
    corner(51, CAP + 35),
  ]),
]);

const N9: Glyph = glyph('9', [
  stroke([
    corner(75, BASELINE - 5),
    corner(85, CAP + 25),
    corner(60, CAP),
    corner(20, CAP + 20),
    corner(30, CAP + 45),
    corner(75, CAP + 40),
  ]),
]);

const digits: Glyph[] = [N0, N1, N2, N3, N4, N5, N6, N7, N8, N9];

// Punctuation
// Dot helper: open ~rectangular path around (cx, cy) with a tiny pen-lift
// gap at the top so first vertex ≠ last. Round caps overlap the gap.
const dotStroke = (cx: number, cy: number, r: number) =>
  stroke([
    corner(cx + 0.5, cy - r),
    corner(cx + r, cy),
    corner(cx, cy + r),
    corner(cx - r, cy),
    corner(cx - 0.5, cy - r),
  ]);

const PERIOD: Glyph = glyph(
  '.',
  [dotStroke(30, BASELINE - 2, 5)],
  { w: 50, h: BOX_H },
);

const QUESTION: Glyph = glyph('?', [
  stroke([
    corner(20, CAP + 12),
    corner(50, CAP),
    corner(80, CAP + 18),
    corner(50, BASELINE - 50),
    corner(50, BASELINE - 30),
  ]),
  dotStroke(50, BASELINE - 2, 5),
]);

const EXCLAIM: Glyph = glyph(
  '!',
  [
    stroke([corner(35, CAP), corner(35, BASELINE - 25)]),
    dotStroke(35, BASELINE - 2, 5),
  ],
  { w: 70, h: BOX_H },
);

// ---------- Font ------------------------------------------------------------

const allGlyphs: Glyph[] = [
  A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  ...lowercase,
  ...digits,
  PERIOD, QUESTION, EXCLAIM,
];

const glyphsRecord: Record<string, Glyph> = {};
for (const g of allGlyphs) glyphsRecord[g.char] = g;

// Sensible default kerning pairs for the base font. Keyed by the 2-character
// pair (first+second). Value in font units (pre-style scale). Negative tightens.
const KERNING: Readonly<Record<string, number>> = {
  AV: -10, AW: -10, AT: -8, AY: -10, Av: -6, Aw: -6, Ay: -6,
  FA: -8,  Fa: -4,  'F.': -12, 'F,': -12,
  LT: -10, LV: -10, LW: -10, LY: -10, Ly: -6,
  PA: -10, Pa: -4,  'P.': -12, 'P,': -12,
  TA: -10, Ta: -10, Te: -10, To: -10, Tu: -8, Tr: -6, 'T.': -10, 'T,': -10,
  VA: -10, Va: -8,  Ve: -6,  Vo: -6, Vr: -4,  'V.': -10, 'V,': -10,
  WA: -8,  Wa: -6,  We: -6,  Wo: -6, 'W.': -8, 'W,': -8,
  YA: -10, Ya: -8,  Ye: -8,  Yo: -8, Yu: -6, 'Y.': -10, 'Y,': -10,
  'r,': -6, 'r.': -6,
};

export const defaultFont: Font = {
  id: 'moritz-base',
  name: 'Moritz Base',
  style: {
    slant: 0,
    scaleX: 1,
    scaleY: 1,
    defaultWidth: constantWidth(8),
    widthOrientation: 'tangent',
    worldAngle: 0,
    capStart: 'round',
    capEnd: 'round',
  },
  glyphs: glyphsRecord,
  kerning: KERNING,
};
