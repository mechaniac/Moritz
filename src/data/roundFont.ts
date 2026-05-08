/**
 * Round comic font: same character coverage as the base font, but designed
 * around smooth tangent handles for every swooping arch. Uses the fewest
 * anchors that still describe each shape, and freely mixes smooth ↔ hard
 * tangents within a single stroke (Illustrator-style break-point) where the
 * outline naturally needs a corner (e.g. the bottom of `J`, the inside of
 * `B`'s bumps).
 *
 * Designed in the same 100×140 box as the base font so glyphs are
 * interchangeable.
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

const BOX_W = 100;
const BOX_H = 140;
const BASELINE = 110;
const CAP = 25;
const MID = (CAP + BASELINE) / 2;

/** Hard corner anchor (zero handles). */
const c = (x: number, y: number): Vertex => ({
  p: v2(x, y),
  inHandle: ZERO,
  outHandle: ZERO,
});

/**
 * Smooth tangent anchor. `(hx, hy)` is the OUT handle; the IN handle is its
 * mirror across `p`. The local tangent direction is +h, length is |h|.
 */
const sm = (x: number, y: number, hx: number, hy: number): Vertex => ({
  p: v2(x, y),
  inHandle: v2(-hx, -hy),
  outHandle: v2(hx, hy),
});

/**
 * Broken-tangent anchor (corner with explicit handles). Marked
 * `breakTangent` so future user drags don't accidentally re-collinearize it.
 */
const br = (
  x: number,
  y: number,
  ihx: number,
  ihy: number,
  ohx: number,
  ohy: number,
): Vertex => ({
  p: v2(x, y),
  inHandle: v2(ihx, ihy),
  outHandle: v2(ohx, ohy),
  breakTangent: true,
});

let strokeCounter = 0;

// Tiny pen-lift gap (in glyph units) used by ellipse-shaped glyphs so the
// stroke has a real start/end. The round end caps (radius = halfWidth) more
// than cover this gap visually — it just guarantees first vertex ≠ last.
const PEN_LIFT = 1;

const stroke = (vertices: Vertex[]): Stroke => {
  if (vertices.length >= 2) {
    const a = vertices[0]!.p;
    const b = vertices[vertices.length - 1]!.p;
    if (a.x === b.x && a.y === b.y) {
      throw new Error(
        'roundFont stroke is closed (first.p === last.p). Strokes must have a distinct start and end — leave a small pen-lift gap.',
      );
    }
  }
  return { id: `r${++strokeCounter}`, vertices };
};

const glyph = (
  char: string,
  strokes: Stroke[],
  box: { w: number; h: number } = { w: BOX_W, h: BOX_H },
): Glyph => ({ char, box, strokes });

// Circle-approximation factor for a quarter-arc with two handles of equal
// length tangent to the radii. ~0.5523 makes a Bézier track a true circle to
// within ~0.06% of the radius — visually indistinguishable.
const KAPPA = 0.5523;

// ---------- Letters ---------------------------------------------------------
// Angular letters (no rounding helps): same skeleton as the base font.
const A: Glyph = glyph('A', [
  stroke([c(10, BASELINE), c(50, CAP)]),
  stroke([c(50, CAP), c(90, BASELINE)]),
  stroke([c(25, BASELINE - 35), c(75, BASELINE - 35)]),
]);

// B: vertical stem + two D-shaped bumps. Each bump is a single smooth arch
// stroke that begins/ends on the stem with a HARD corner (handles point
// only outward into the bump), then arcs through a smooth crest.
const B: Glyph = glyph('B', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  // top bump: from (20, CAP) bulges right to (75, MID-7) and back to (20, MID-7)
  stroke([
    br(20, CAP, 0, 0, 32, 0),
    sm(75, (CAP + (MID - 7)) / 2, 0, 18),
    br(20, MID - 7, 32, 0, 0, 0),
  ]),
  // lower bump: from (20, MID-7) bulges further right to (82, BASELINE)
  stroke([
    br(20, MID - 7, 0, 0, 36, 0),
    sm(82, ((MID - 7) + BASELINE) / 2, 0, 22),
    br(20, BASELINE, 36, 0, 0, 0),
  ]),
]);

// C: single open arc, ~270° of an ellipse. 3 anchors total — the two ends
// have one-sided handles (broken tangent), the middle is fully smooth.
const C: Glyph = glyph('C', [
  stroke([
    br(78, CAP + 8, 0, 0, -25, -8),
    sm(15, (CAP + BASELINE) / 2, 0, 28),
    br(78, BASELINE - 8, -25, 8, 0, 0),
  ]),
]);

// D: vertical stem + half ellipse on the right.
const D: Glyph = glyph('D', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([
    br(20, CAP, 0, 0, 40, 0),
    sm(85, (CAP + BASELINE) / 2, 0, 35),
    br(20, BASELINE, 40, 0, 0, 0),
  ]),
]);

const E: Glyph = glyph('E', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([c(20, CAP), c(85, CAP)]),
  stroke([c(20, BASELINE - 45), c(70, BASELINE - 45)]),
  stroke([c(20, BASELINE), c(85, BASELINE)]),
]);

const F: Glyph = glyph('F', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([c(20, CAP), c(85, CAP)]),
  stroke([c(20, BASELINE - 45), c(70, BASELINE - 45)]),
]);

// G: like C, then continues at the bottom-right into a vertical, then a
// horizontal crossbar — soft-to-hard transitions inside one stroke.
const G: Glyph = glyph('G', [
  stroke([
    br(78, CAP + 8, 0, 0, -25, -8),
    sm(15, (CAP + BASELINE) / 2, 0, 28),
    sm(50, BASELINE, 19, 0),
    sm(85, BASELINE - 25, 0, -10),
    c(85, MID + 5),
    c(55, MID + 5),
  ]),
]);

const H: Glyph = glyph('H', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([c(80, CAP), c(80, BASELINE)]),
  stroke([c(20, MID), c(80, MID)]),
]);

const I: Glyph = glyph(
  'I',
  [stroke([c(30, CAP), c(30, BASELINE)])],
  { w: 60, h: BOX_H },
);

// J: straight stem; smooth bottom hook curving left.
const J: Glyph = glyph(
  'J',
  [
    stroke([
      c(70, CAP),
      sm(70, BASELINE - 22, 0, 12),
      sm(45, BASELINE, -18, 0),
      br(22, BASELINE - 14, -8, 12, 0, 0),
    ]),
  ],
  { w: 90, h: BOX_H },
);

const K: Glyph = glyph('K', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([c(80, CAP), c(20, MID)]),
  stroke([c(20, MID), c(85, BASELINE)]),
]);

const L: Glyph = glyph('L', [
  stroke([c(20, CAP), c(20, BASELINE), c(80, BASELINE)]),
]);

const M: Glyph = glyph(
  'M',
  [
    stroke([
      c(15, BASELINE),
      c(15, CAP),
      c(55, BASELINE - 25),
      c(95, CAP),
      c(95, BASELINE),
    ]),
  ],
  { w: 110, h: BOX_H },
);

const N: Glyph = glyph('N', [
  stroke([c(20, BASELINE), c(20, CAP), c(80, BASELINE), c(80, CAP)]),
]);

// O: ellipse drawn as a single open stroke. Start and end sit on either
// side of the top apex, separated by PEN_LIFT — the round caps cover the
// gap so it reads as a continuous ring.
const O: Glyph = (() => {
  const cx = 50;
  const cy = (CAP + BASELINE) / 2;
  const rx = 35;
  const ry = (BASELINE - CAP) / 2;
  return glyph('O', [
    stroke([
      sm(cx + PEN_LIFT, CAP, KAPPA * rx, 0),
      sm(cx + rx, cy, 0, KAPPA * ry),
      sm(cx, BASELINE, -KAPPA * rx, 0),
      sm(cx - rx, cy, 0, -KAPPA * ry),
      sm(cx - PEN_LIFT, CAP, KAPPA * rx, 0),
    ]),
  ]);
})();

// P: stem + top half-ellipse meeting back into the stem at MID-2.
const P: Glyph = glyph('P', [
  stroke([c(20, CAP), c(20, BASELINE)]),
  stroke([
    br(20, CAP, 0, 0, 32, 0),
    sm(80, (CAP + (MID - 2)) / 2, 0, 18),
    br(20, MID - 2, 32, 0, 0, 0),
  ]),
]);

// Q: O + diagonal tail through the lower right.
const Q: Glyph = glyph('Q', [
  ...O.strokes,
  stroke([c(60, BASELINE - 18), c(95, BASELINE + 12)]),
]);

// R: P + straight diagonal leg.
const R: Glyph = glyph('R', [
  ...P.strokes,
  stroke([c(45, MID - 2), c(85, BASELINE)]),
]);

// S: a single S-curve with all-smooth interior anchors.
const S: Glyph = glyph('S', [
  stroke([
    br(80, CAP + 12, 0, 0, -22, -10),
    sm(50, CAP, -22, 0),
    sm(20, CAP + 22, 0, 18),
    sm(50, MID, 22, 0),
    sm(80, BASELINE - 22, 0, 18),
    sm(50, BASELINE, -22, 0),
    br(20, BASELINE - 12, 22, 8, 0, 0),
  ]),
]);

const T: Glyph = glyph('T', [
  stroke([c(15, CAP), c(85, CAP)]),
  stroke([c(50, CAP), c(50, BASELINE)]),
]);

// U: straight verticals; smooth U-bend at the bottom; the side anchors are
// SMOOTH points whose handles point only downward, which keeps the upper
// segment a clean straight line (collinear handles on a vertical chord).
const U: Glyph = glyph('U', [
  stroke([
    c(20, CAP),
    sm(20, BASELINE - 25, 0, 14),
    sm(50, BASELINE, 19, 0),
    sm(80, BASELINE - 25, 0, -14),
    c(80, CAP),
  ]),
]);

const V: Glyph = glyph('V', [
  stroke([c(15, CAP), c(50, BASELINE), c(85, CAP)]),
]);

const W: Glyph = glyph(
  'W',
  [
    stroke([
      c(10, CAP),
      c(35, BASELINE),
      c(60, CAP + 30),
      c(85, BASELINE),
      c(110, CAP),
    ]),
  ],
  { w: 120, h: BOX_H },
);

const X: Glyph = glyph('X', [
  stroke([c(15, CAP), c(85, BASELINE)]),
  stroke([c(85, CAP), c(15, BASELINE)]),
]);

const Y: Glyph = glyph('Y', [
  stroke([c(15, CAP), c(50, BASELINE - 40)]),
  stroke([c(85, CAP), c(50, BASELINE - 40)]),
  stroke([c(50, BASELINE - 40), c(50, BASELINE)]),
]);

const Z: Glyph = glyph('Z', [
  stroke([c(15, CAP), c(85, CAP), c(15, BASELINE), c(85, BASELINE)]),
]);

// ---------- Lowercase ------------------------------------------------------
// Real lowercase forms with smooth-tangent bowls. Same metric grid as the
// uppercase letters above; XHEIGHT, ASC, DESC define the lower-band layout.

const XHEIGHT = BASELINE - 55; // y=55, top of x-band
const ASC = CAP;               // y=25, ascender top
const DESC = BASELINE + 25;    // y=135, descender depth

const lowerGlyph = (char: string, w: number, strokes: Stroke[]): Glyph => ({
  char,
  box: { w, h: BOX_H },
  strokes,
});

// Convenience: half-x-band radius for round bowls.
const RBOWL = (BASELINE - XHEIGHT) / 2; // 27.5

// 'a' — single-story: closed bowl (open at top to satisfy invariant)
//        with right stem connecting xheight..baseline.
const a: Glyph = lowerGlyph('a', 70, [
  // bowl (counter-clockwise from top, open at top right)
  stroke([
    sm(60, XHEIGHT + 6, -8, 0),
    sm(35, XHEIGHT, 0, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 6, 8, 0),
  ]),
  // right stem
  stroke([c(60, XHEIGHT + 4), c(60, BASELINE)]),
]);

// 'b' — ascender stem on the left + bowl on the right.
const b: Glyph = lowerGlyph('b', 75, [
  stroke([c(15, ASC), c(15, BASELINE)]),
  stroke([
    sm(15, XHEIGHT + 6, 0, 0),
    sm(40, XHEIGHT, RBOWL * KAPPA, 0),
    sm(65, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(40, BASELINE, -RBOWL * KAPPA, 0),
    sm(15, BASELINE - 6, 0, 0),
  ]),
]);

// 'c' — open bowl, opens to the right.
const c_: Glyph = lowerGlyph('c', 65, [
  stroke([
    sm(60, XHEIGHT + 14, -10, -8),
    sm(35, XHEIGHT, 0, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 14, 10, 8),
  ]),
]);

// 'd' — bowl on the left + ascender stem on the right.
const d: Glyph = lowerGlyph('d', 75, [
  stroke([c(60, ASC), c(60, BASELINE)]),
  stroke([
    sm(60, XHEIGHT + 6, 0, 0),
    sm(35, XHEIGHT, -RBOWL * KAPPA, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 6, 0, 0),
  ]),
]);

// 'e' — closed eye with horizontal crossbar.
const e: Glyph = lowerGlyph('e', 65, [
  // crossbar
  stroke([c(10, XHEIGHT + RBOWL), c(60, XHEIGHT + RBOWL)]),
  // bowl opening at lower-right
  stroke([
    sm(60, XHEIGHT + RBOWL - 1, 0, -10),
    sm(35, XHEIGHT, -RBOWL * KAPPA, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 12, 8, 8),
  ]),
]);

// 'f' — hook + descending stem + crossbar.
const f: Glyph = lowerGlyph('f', 50, [
  stroke([
    sm(45, ASC + 12, -8, -6),
    sm(28, ASC + 4, 0, 0),
    sm(20, ASC + 22, 0, 12),
    c(20, BASELINE),
  ]),
  stroke([c(5, XHEIGHT + 5), c(40, XHEIGHT + 5)]),
]);

// 'g' — single-story: bowl + descender loop.
const g: Glyph = lowerGlyph('g', 70, [
  // bowl
  stroke([
    sm(60, XHEIGHT + 6, -8, 0),
    sm(35, XHEIGHT, 0, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 6, 8, 0),
  ]),
  // right stem dropping into looped descender
  stroke([
    c(60, XHEIGHT + 4),
    c(60, BASELINE),
    sm(50, DESC, 8, 8),
    sm(20, DESC + 2, -10, 0),
    sm(8, BASELINE + 10, 0, -8),
  ]),
]);

// 'h' — ascender + shoulder.
const h: Glyph = lowerGlyph('h', 75, [
  stroke([c(15, ASC), c(15, BASELINE)]),
  stroke([
    sm(15, XHEIGHT + 12, 0, -10),
    sm(37, XHEIGHT, 12, 0),
    sm(60, XHEIGHT + 14, 0, 14),
    c(60, BASELINE),
  ]),
]);

// 'i' — dot + stem.
const i: Glyph = lowerGlyph('i', 28, [
  stroke([c(12, ASC + 8), c(16, ASC + 8)]),
  stroke([c(14, XHEIGHT + 5), c(14, BASELINE)]),
]);

// 'j' — dot + stem with descender hook.
const j: Glyph = lowerGlyph('j', 45, [
  stroke([c(30, ASC + 8), c(34, ASC + 8)]),
  stroke([
    c(32, XHEIGHT + 5),
    c(32, BASELINE),
    sm(25, DESC, 0, 8),
    sm(12, DESC - 2, -8, 0),
    sm(5, BASELINE + 10, 0, -8),
  ]),
]);

// 'k' — ascender + diagonal arms.
const k: Glyph = lowerGlyph('k', 60, [
  stroke([c(15, ASC), c(15, BASELINE)]),
  stroke([
    c(55, XHEIGHT + 5),
    c(15, BASELINE - 22),
    c(55, BASELINE),
  ]),
]);

// 'l' — single ascender stem.
const l: Glyph = lowerGlyph('l', 28, [
  stroke([c(14, ASC), c(14, BASELINE)]),
]);

// 'm' — three stems with two shoulders.
const m: Glyph = lowerGlyph('m', 105, [
  stroke([c(10, XHEIGHT + 12), c(10, BASELINE)]),
  stroke([
    sm(10, XHEIGHT + 12, 0, -10),
    sm(30, XHEIGHT, 10, 0),
    sm(50, XHEIGHT + 14, 0, 12),
    c(50, BASELINE),
  ]),
  stroke([
    sm(50, XHEIGHT + 12, 0, -10),
    sm(72, XHEIGHT, 12, 0),
    sm(95, XHEIGHT + 14, 0, 14),
    c(95, BASELINE),
  ]),
]);

// 'n' — stem + shoulder.
const n: Glyph = lowerGlyph('n', 75, [
  stroke([c(15, XHEIGHT + 12), c(15, BASELINE)]),
  stroke([
    sm(15, XHEIGHT + 12, 0, -10),
    sm(37, XHEIGHT, 12, 0),
    sm(60, XHEIGHT + 14, 0, 14),
    c(60, BASELINE),
  ]),
]);

// 'o' — closed ring opened minimally at top.
const o: Glyph = lowerGlyph('o', 65, [
  stroke([
    sm(35, XHEIGHT, 14, 0),
    sm(60, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, -14, 0),
    sm(10, XHEIGHT + RBOWL, 0, -RBOWL * KAPPA),
    sm(35 - PEN_LIFT, XHEIGHT, 14, 0),
  ]),
]);

// 'p' — stem with descender + bowl.
const p: Glyph = lowerGlyph('p', 75, [
  stroke([c(15, XHEIGHT + 5), c(15, DESC)]),
  stroke([
    sm(15, XHEIGHT + 6, 0, 0),
    sm(40, XHEIGHT, RBOWL * KAPPA, 0),
    sm(65, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(40, BASELINE, -RBOWL * KAPPA, 0),
    sm(15, BASELINE - 6, 0, 0),
  ]),
]);

// 'q' — bowl + right stem with tail.
const q: Glyph = lowerGlyph('q', 75, [
  stroke([c(60, XHEIGHT + 5), c(60, DESC)]),
  stroke([
    sm(60, XHEIGHT + 6, 0, 0),
    sm(35, XHEIGHT, -RBOWL * KAPPA, 0),
    sm(10, XHEIGHT + RBOWL, 0, RBOWL * KAPPA),
    sm(35, BASELINE, RBOWL * KAPPA, 0),
    sm(60, BASELINE - 6, 0, 0),
  ]),
  stroke([c(60, DESC), c(72, BASELINE + 18)]),
]);

// 'r' — stem + small arm.
const r: Glyph = lowerGlyph('r', 55, [
  stroke([c(15, XHEIGHT + 12), c(15, BASELINE)]),
  stroke([
    sm(15, XHEIGHT + 12, 0, -10),
    sm(35, XHEIGHT, 12, 0),
    sm(50, XHEIGHT + 10, 0, 8),
  ]),
]);

// 's' — double curve.
const s: Glyph = lowerGlyph('s', 65, [
  stroke([
    sm(55, XHEIGHT + 12, -8, -8),
    sm(30, XHEIGHT, 0, 0),
    sm(10, XHEIGHT + 14, 0, 8),
    sm(40, BASELINE - RBOWL, 14, 0),
    sm(55, BASELINE - 14, 0, 8),
    sm(30, BASELINE, 0, 0),
    sm(10, BASELINE - 12, 8, 8),
  ]),
]);

// 't' — stem with foot + crossbar.
const t: Glyph = lowerGlyph('t', 50, [
  stroke([
    c(20, XHEIGHT - 12),
    c(20, BASELINE - 8),
    sm(28, BASELINE, 8, 0),
    sm(40, BASELINE - 5, 8, -4),
  ]),
  stroke([c(5, XHEIGHT + 3), c(45, XHEIGHT + 3)]),
]);

// 'u' — U curve + right stem.
const u: Glyph = lowerGlyph('u', 70, [
  stroke([
    c(10, XHEIGHT + 4),
    c(10, BASELINE - RBOWL + 5),
    sm(35, BASELINE, -RBOWL * KAPPA, 0),
    sm(60, BASELINE - 14, 0, -10),
  ]),
  stroke([c(60, XHEIGHT + 4), c(60, BASELINE)]),
]);

const v: Glyph = lowerGlyph('v', 70, [
  stroke([c(10, XHEIGHT + 2), c(35, BASELINE), c(60, XHEIGHT + 2)]),
]);

const w: Glyph = lowerGlyph('w', 90, [
  stroke([
    c(10, XHEIGHT + 2),
    c(28, BASELINE),
    c(45, XHEIGHT + 18),
    c(62, BASELINE),
    c(80, XHEIGHT + 2),
  ]),
]);

const x: Glyph = lowerGlyph('x', 70, [
  stroke([c(10, XHEIGHT + 2), c(60, BASELINE)]),
  stroke([c(60, XHEIGHT + 2), c(10, BASELINE)]),
]);

// 'y' — left arm meets at baseline-ish; right arm continues into descender.
const y: Glyph = lowerGlyph('y', 70, [
  stroke([c(10, XHEIGHT + 2), c(38, BASELINE - 5)]),
  stroke([
    c(60, XHEIGHT + 2),
    c(35, BASELINE),
    c(20, DESC - 5),
    c(8, DESC),
  ]),
]);

const z: Glyph = lowerGlyph('z', 65, [
  stroke([
    c(10, XHEIGHT + 5),
    c(55, XHEIGHT + 5),
    c(10, BASELINE),
    c(55, BASELINE),
  ]),
]);

const lowercase: Glyph[] = [
  a, b, c_, d, e, f, g, h, i, j, k, l, m,
  n, o, p, q, r, s, t, u, v, w, x, y, z,
];

// ---------- Digits ----------------------------------------------------------

// 0: open ellipse, same construction as O.
const N0: Glyph = (() => {
  const cx = 50, cy = (CAP + BASELINE) / 2, rx = 35, ry = (BASELINE - CAP) / 2;
  return glyph('0', [
    stroke([
      sm(cx + PEN_LIFT, CAP, KAPPA * rx, 0),
      sm(cx + rx, cy, 0, KAPPA * ry),
      sm(cx, BASELINE, -KAPPA * rx, 0),
      sm(cx - rx, cy, 0, -KAPPA * ry),
      sm(cx - PEN_LIFT, CAP, KAPPA * rx, 0),
    ]),
  ]);
})();

const N1: Glyph = glyph(
  '1',
  [
    stroke([c(30, CAP + 15), c(50, CAP), c(50, BASELINE)]),
    stroke([c(25, BASELINE), c(75, BASELINE)]),
  ],
  { w: 70, h: BOX_H },
);

// 2: smooth top arc → diagonal → straight base.
const N2: Glyph = glyph('2', [
  stroke([
    br(15, CAP + 18, 0, 0, 0, -18),
    sm(50, CAP, 22, 0),
    sm(82, CAP + 22, 0, 18),
    c(15, BASELINE),
    c(85, BASELINE),
  ]),
]);

// 3: two smooth bumps that share a midpoint.
const N3: Glyph = glyph('3', [
  stroke([
    br(15, CAP + 12, 0, 0, 0, -12),
    sm(50, CAP, 22, 0),
    sm(82, CAP + 22, 0, 18),
    sm(50, MID, -22, 0),
    sm(82, BASELINE - 22, 0, 18),
    sm(50, BASELINE, -22, 0),
    br(15, BASELINE - 12, 0, 12, 0, 0),
  ]),
]);

const N4: Glyph = glyph('4', [
  stroke([c(70, CAP), c(15, BASELINE - 35), c(85, BASELINE - 35)]),
  stroke([c(70, CAP + 20), c(70, BASELINE)]),
]);

// 5: straight top + bottom loop.
const N5: Glyph = glyph('5', [
  stroke([
    c(80, CAP),
    c(20, CAP),
    c(20, MID),
    sm(55, MID - 4, 22, 0),
    sm(82, BASELINE - 25, 0, 18),
    sm(50, BASELINE, -22, 0),
    br(15, BASELINE - 12, 0, 12, 0, 0),
  ]),
]);

// 6: lower closed loop entered by a smooth tail from upper-right.
const N6: Glyph = glyph('6', [
  stroke([
    br(78, CAP + 5, 0, 0, -22, 6),
    sm(15, MID + 5, 0, 25),
    sm(50, BASELINE, 22, 0),
    sm(82, MID + 22, 0, -22),
    sm(50, MID - 5, -22, 0),
    sm(20, MID + 8, 0, 16),
  ]),
]);

// 8: figure-eight drawn as a single open stroke. Start sits just left of
// the midpoint, ascends through the top loop, returns to the midpoint,
// descends through the bottom loop, ends just right of the midpoint.
const N8: Glyph = (() => {
  const cx = 50;
  const yMid = MID;
  const rxT = 25, ryT = (yMid - CAP) / 2;
  const cyT = (CAP + yMid) / 2;
  const rxB = 32, ryB = (BASELINE - yMid) / 2;
  const cyB = (yMid + BASELINE) / 2;
  return glyph('8', [
    stroke([
      sm(cx - PEN_LIFT, yMid, KAPPA * rxT, 0),
      sm(cx + rxT, cyT, 0, -KAPPA * ryT),
      sm(cx, CAP, -KAPPA * rxT, 0),
      sm(cx - rxT, cyT, 0, KAPPA * ryT),
      sm(cx, yMid, KAPPA * rxT, 0),
      sm(cx + rxB, cyB, 0, KAPPA * ryB),
      sm(cx, BASELINE, -KAPPA * rxB, 0),
      sm(cx - rxB, cyB, 0, -KAPPA * ryB),
      sm(cx + PEN_LIFT, yMid, KAPPA * rxT, 0),
    ]),
  ]);
})();

const N7: Glyph = glyph('7', [
  stroke([c(15, CAP), c(85, CAP), c(40, BASELINE)]),
]);

// 9: mirror of 6.
const N9: Glyph = glyph('9', [
  stroke([
    br(22, BASELINE - 5, 0, 0, 22, -6),
    sm(85, MID - 5, 0, -25),
    sm(50, CAP, -22, 0),
    sm(18, MID - 22, 0, 22),
    sm(50, MID + 5, 22, 0),
    sm(80, MID - 8, 0, -16),
  ]),
]);

const digits: Glyph[] = [N0, N1, N2, N3, N4, N5, N6, N7, N8, N9];

// ---------- Punctuation ----------------------------------------------------

// Small filled dot drawn as an open stroke: ~360° around (cx, cy) with a
// PEN_LIFT gap at the top so first vertex ≠ last. Round caps cover the gap.
const dotStroke = (cx: number, cy: number, r: number) =>
  stroke([
    sm(cx + PEN_LIFT * 0.5, cy - r, r, 0),
    sm(cx + r, cy, 0, r),
    sm(cx, cy + r, -r, 0),
    sm(cx - r, cy, 0, -r),
    sm(cx - PEN_LIFT * 0.5, cy - r, r, 0),
  ]);

const PERIOD: Glyph = glyph(
  '.',
  [dotStroke(30, BASELINE - 4, 4)],
  { w: 50, h: BOX_H },
);

const QUESTION: Glyph = glyph('?', [
  // hook + stem
  stroke([
    br(15, CAP + 18, 0, 0, 0, -22),
    sm(50, CAP, 25, 0),
    sm(82, CAP + 22, 0, 22),
    sm(50, MID + 5, 0, 12),
    c(50, BASELINE - 25),
  ]),
  // dot
  dotStroke(50, BASELINE - 4, 4),
]);

const EXCLAIM: Glyph = glyph(
  '!',
  [
    stroke([c(35, CAP), c(35, BASELINE - 25)]),
    dotStroke(35, BASELINE - 4, 4),
  ],
  { w: 70, h: BOX_H },
);

const COMMA: Glyph = glyph(
  ',',
  [
    dotStroke(30, BASELINE - 4, 4),
    stroke([
      c(30, BASELINE + 0),
      c(28, BASELINE + 8),
      c(22, BASELINE + 16),
    ]),
  ],
  { w: 50, h: BOX_H },
);

const COLON: Glyph = glyph(
  ':',
  [
    dotStroke(30, BASELINE - 35, 4),
    dotStroke(30, BASELINE - 4, 4),
  ],
  { w: 50, h: BOX_H },
);

const SEMICOLON: Glyph = glyph(
  ';',
  [
    dotStroke(30, BASELINE - 35, 4),
    dotStroke(30, BASELINE - 4, 4),
    stroke([
      c(30, BASELINE + 0),
      c(28, BASELINE + 8),
      c(22, BASELINE + 16),
    ]),
  ],
  { w: 50, h: BOX_H },
);

// ---------- Font ------------------------------------------------------------

const allGlyphs: Glyph[] = [
  A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  ...lowercase,
  ...digits,
  PERIOD, COMMA, COLON, SEMICOLON, QUESTION, EXCLAIM,
];

const glyphsRecord: Record<string, Glyph> = {};
for (const g of allGlyphs) glyphsRecord[g.char] = g;

export const roundFont: Font = {
  id: 'moritz-round',
  name: 'Moritz Round',
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
  glyphs: glyphsRecord,
};
