/**
 * Built-in bubble preset library for Moritz.
 *
 * Each preset is a multi-layer composition: a frame layer plus
 * optional tail / accent layers. Layers carry standard `Glyph`
 * stroke data so the GlyphSetter spline editor can be reused
 * for editing bubble artwork later. For v1 the artwork is
 * hand-tuned simple shapes meant as a starting point.
 *
 * Coordinate system: identical to glyph space — y grows downward,
 * (0,0) is the top-left of the layer's own box. The bubble's
 * reference box is 200×140 (units arbitrary; bubbles are scaled
 * uniformly to fit the placed page bubble).
 */

import { defaultFont } from './defaultFont.js';
import {
  v2,
  ZERO,
  type Bubble,
  type BubbleFont,
  type BubbleLayer,
  type Glyph,
  type Stroke,
  type Vertex,
} from '../core/types.js';

const BOX_W = 200;
const BOX_H = 140;

const corner = (x: number, y: number): Vertex => ({
  p: v2(x, y),
  inHandle: ZERO,
  outHandle: ZERO,
});

const smooth = (x: number, y: number, hx: number, hy: number): Vertex => ({
  p: v2(x, y),
  inHandle: v2(-hx, -hy),
  outHandle: v2(hx, hy),
});

let nextId = 0;
const sid = (): string => `bs${++nextId}`;

const stroke = (vertices: Vertex[]): Stroke => ({
  id: sid(),
  vertices,
});

const glyph = (
  name: string,
  strokes: Stroke[],
  box: { w: number; h: number } = { w: BOX_W, h: BOX_H },
): Glyph => ({ char: name, box, strokes });

// ---------- Layer constructors ---------------------------------------------

/**
 * Rounded-rectangle frame approximated by 4 cubic-bezier corners. Centered
 * inside the layer's own box.
 */
function rectFrameGlyph(
  w: number,
  h: number,
  r: number,
  inset: number = 0,
): Glyph {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const k = r * 0.5523; // approx bezier circle handle
  // Build a single closed-ish stroke walking the perimeter, with a tiny
  // pen-lift gap at the top-middle so the stroke invariant
  // (start.p !== end.p) is satisfied.
  const verts: Vertex[] = [
    // top edge starting just right of the gap
    corner(x0 + r + 0.5, y0),
    // top-right corner
    smooth(x1 - r, y0, r * 0.5, 0),
    {
      p: v2(x1, y0 + r),
      inHandle: v2(0, -k),
      outHandle: v2(0, r * 0.5),
    },
    // right edge
    smooth(x1, y1 - r, 0, r * 0.5),
    {
      p: v2(x1 - r, y1),
      inHandle: v2(k, 0),
      outHandle: v2(-r * 0.5, 0),
    },
    // bottom edge
    smooth(x0 + r, y1, -r * 0.5, 0),
    {
      p: v2(x0, y1 - r),
      inHandle: v2(0, k),
      outHandle: v2(0, -r * 0.5),
    },
    // left edge
    smooth(x0, y0 + r, 0, -r * 0.5),
    {
      p: v2(x0 + r, y0),
      inHandle: v2(-k, 0),
      outHandle: v2(r * 0.5, 0),
    },
    // close just left of the gap
    corner(x0 + r - 0.5 + (w - 2 * r) - 1, y0),
  ];
  return glyph('frame', [stroke(verts)], { w, h });
}

/** Oval frame as a single near-closed stroke. */
function ovalFrameGlyph(w: number, h: number): Glyph {
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w - 2) / 2;
  const ry = (h - 2) / 2;
  const k = 0.5523;
  // 4-anchor bezier circle, with a 1-unit pen-lift gap at the top.
  const verts: Vertex[] = [
    {
      p: v2(cx + 0.5, cy - ry),
      inHandle: ZERO,
      outHandle: v2(rx * k, 0),
    },
    {
      p: v2(cx + rx, cy),
      inHandle: v2(0, -ry * k),
      outHandle: v2(0, ry * k),
    },
    {
      p: v2(cx, cy + ry),
      inHandle: v2(rx * k, 0),
      outHandle: v2(-rx * k, 0),
    },
    {
      p: v2(cx - rx, cy),
      inHandle: v2(0, ry * k),
      outHandle: v2(0, -ry * k),
    },
    {
      p: v2(cx - 0.5, cy - ry),
      inHandle: v2(-rx * k, 0),
      outHandle: ZERO,
    },
  ];
  return glyph('frame', [stroke(verts)], { w, h });
}

/** Triangular tail pointing down-left. Anchored to its own small box. */
function tailGlyph(
  w: number,
  h: number,
  baseLeftX: number,
  baseRightX: number,
  tipX: number,
  tipY: number,
): Glyph {
  const verts: Vertex[] = [
    corner(baseLeftX, 0),
    corner(tipX, tipY),
    corner(baseRightX, 0),
  ];
  return glyph('tail', [stroke(verts)], { w, h });
}

/**
 * Cloud-style scalloped frame: a sequence of small bumps around the
 * perimeter. Approximated as a single open stroke with a tiny gap at the
 * top.
 */
function cloudFrameGlyph(w: number, h: number): Glyph {
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w - 4) / 2;
  const ry = (h - 4) / 2;
  const N = 14; // bumps
  const bumpDepth = 6;
  const verts: Vertex[] = [];
  for (let i = 0; i <= N; i++) {
    // Skip the first bump (creates the pen-lift gap)
    const t = i / N;
    const a = -Math.PI / 2 + t * Math.PI * 2;
    const r = i === 0 || i === N ? rx + 0.25 : rx + bumpDepth * Math.sin(t * N * Math.PI);
    const x = cx + Math.cos(a) * r;
    const y = cy + (Math.sin(a) * (i % 2 === 0 ? ry + bumpDepth : ry));
    if (i === 0) {
      verts.push(corner(x + 0.5, y));
    } else if (i === N) {
      verts.push(corner(x - 0.5, y));
    } else {
      const tx = -Math.sin(a) * 8;
      const ty = Math.cos(a) * 8;
      verts.push(smooth(x, y, tx, ty));
    }
  }
  return glyph('cloud-frame', [stroke(verts)], { w, h });
}

/** Jagged "shout" frame: zig-zag star polygon, single open stroke. */
function shoutFrameGlyph(w: number, h: number): Glyph {
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w - 4) / 2;
  const ry = (h - 4) / 2;
  const N = 18;
  const inner = 0.7;
  const verts: Vertex[] = [];
  for (let i = 0; i <= N * 2; i++) {
    const t = i / (N * 2);
    const a = -Math.PI / 2 + t * Math.PI * 2;
    const f = i % 2 === 0 ? 1 : inner;
    const x = cx + Math.cos(a) * rx * f;
    const y = cy + Math.sin(a) * ry * f;
    if (i === 0) verts.push(corner(x + 0.5, y));
    else if (i === N * 2) verts.push(corner(x - 0.5, y));
    else verts.push(corner(x, y));
  }
  return glyph('shout-frame', [stroke(verts)], { w, h });
}

/** Small dot, used for thought-bubble satellites. */
function dotGlyph(d: number): Glyph {
  const r = d / 2;
  const k = 0.5523;
  const verts: Vertex[] = [
    {
      p: v2(r + 0.4, 0),
      inHandle: ZERO,
      outHandle: v2(r * k, 0),
    },
    {
      p: v2(d, r),
      inHandle: v2(0, -r * k),
      outHandle: v2(0, r * k),
    },
    {
      p: v2(r, d),
      inHandle: v2(r * k, 0),
      outHandle: v2(-r * k, 0),
    },
    {
      p: v2(0, r),
      inHandle: v2(0, r * k),
      outHandle: v2(0, -r * k),
    },
    {
      p: v2(r - 0.4, 0),
      inHandle: v2(-r * k, 0),
      outHandle: ZERO,
    },
  ];
  return glyph('dot', [stroke(verts)], { w: d, h: d });
}

let lid = 0;
const layerId = (): string => `L${++lid}`;

const layer = (
  name: string,
  glyph: Glyph,
  opts: Partial<Omit<BubbleLayer, 'id' | 'name' | 'glyph'>> = {},
): BubbleLayer => ({
  id: layerId(),
  name,
  glyph,
  anchorX: 0.5,
  anchorY: 0.5,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  visible: true,
  fill: { mode: 'paper', opacity: 1 },
  ...opts,
});

// ---------- Presets --------------------------------------------------------

const speech: Bubble = {
  id: 'speech',
  name: 'Speech',
  box: { w: BOX_W, h: BOX_H },
  grid: { cols: 8, rows: 6 },
  dummyText: 'HELLO\nWORLD',
  layers: [
    layer('Frame', rectFrameGlyph(BOX_W, 100, 22), {
      anchorX: 0.5,
      anchorY: 0.0,
      role: 'frame',
    }),
    layer(
      'Tail',
      tailGlyph(60, 50, 0, 36, 30, 50),
      {
        anchorX: 0.3,
        anchorY: 1.0,
        offsetX: -30,
        offsetY: -50,
        scale: 0.9,
        role: 'tail',
      },
    ),
  ],
};

const oval: Bubble = {
  id: 'oval',
  name: 'Oval',
  box: { w: BOX_W, h: BOX_H },
  grid: { cols: 8, rows: 6 },
  dummyText: 'OH MY!',
  layers: [
    layer('Frame', ovalFrameGlyph(BOX_W, 110), {
      anchorX: 0.5,
      anchorY: 0.0,
      role: 'frame',
    }),
    layer(
      'Tail',
      tailGlyph(50, 40, 0, 28, 22, 40),
      {
        anchorX: 0.35,
        anchorY: 1.0,
        offsetX: -25,
        offsetY: -45,
        scale: 0.9,
        role: 'tail',
      },
    ),
  ],
};

const thought: Bubble = {
  id: 'thought',
  name: 'Thought',
  box: { w: BOX_W, h: BOX_H },
  grid: { cols: 8, rows: 6 },
  dummyText: 'hmm...',
  layers: [
    layer('Frame', cloudFrameGlyph(BOX_W, 110), {
      anchorX: 0.5,
      anchorY: 0.0,
      role: 'frame',
    }),
    layer('Bubble 1', dotGlyph(20), {
      anchorX: 0.32,
      anchorY: 1.0,
      offsetX: -10,
      offsetY: -30,
      scale: 1,
      role: 'tail',
      fill: { mode: 'paper', opacity: 1 },
    }),
    layer('Bubble 2', dotGlyph(12), {
      anchorX: 0.28,
      anchorY: 1.0,
      offsetX: -6,
      offsetY: -10,
      scale: 1,
      role: 'tail',
      fill: { mode: 'paper', opacity: 1 },
    }),
  ],
};

const shout: Bubble = {
  id: 'shout',
  name: 'Shout',
  box: { w: BOX_W, h: BOX_H },
  grid: { cols: 8, rows: 6 },
  dummyText: 'WHAM!',
  layers: [
    layer('Frame', shoutFrameGlyph(BOX_W, 130), {
      anchorX: 0.5,
      anchorY: 0.0,
      role: 'frame',
    }),
  ],
};

const caption: Bubble = {
  id: 'caption',
  name: 'Caption',
  box: { w: BOX_W, h: BOX_H },
  grid: { cols: 8, rows: 6 },
  dummyText: 'Later that day...',
  layers: [
    layer('Frame', rectFrameGlyph(BOX_W, 100, 4), {
      anchorX: 0.5,
      anchorY: 0.0,
      role: 'frame',
    }),
  ],
};

export const defaultBubbleFont: BubbleFont = {
  id: 'moritz.bubbles.default',
  name: 'Default Bubbles',
  // Inherit the default font's style as the bubble rendering style
  // baseline. BubbleSetter will allow overriding it just like StyleSetter.
  style: defaultFont.style,
  bubbles: {
    [speech.id]: speech,
    [oval.id]: oval,
    [thought.id]: thought,
    [shout.id]: shout,
    [caption.id]: caption,
  },
};
