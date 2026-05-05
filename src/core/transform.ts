/**
 * Apply a `StyleSettings` affine transform to a glyph's *control points*
 * (vertex positions and Bézier handles), NOT to its rendered outline.
 *
 * The transform rule from the spec:
 *   When slant/scaleX/scaleY change, we transform every Vertex.p, inHandle,
 *   outHandle, then re-evaluate the Bézier and re-outline. This keeps stroke
 *   thickness uniform under stretch/slant (no smeared widths).
 *
 * Affine (in font units, origin at glyph baseline-left of box):
 *
 *   x' = scaleX * x + tan(slant) * scaleY * y
 *   y' = scaleY * y
 *
 * Note slant uses `tan` so an angle is intuitive (e.g. 12° = mild italic).
 * Handles are deltas relative to their anchor — they transform as vectors
 * (the same matrix without translation), which here is the same matrix
 * since translation is zero.
 */

import type { Glyph, Stroke, StyleSettings, Vec2, Vertex } from './types.js';

export type Affine = {
  /** column-major 2x2 + translation: [a, b, c, d, tx, ty] applies p' = M·p + t. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
};

export function affineFromStyle(style: StyleSettings): Affine {
  const sh = Math.tan(style.slant);
  return {
    a: style.scaleX,
    b: 0,
    c: sh * style.scaleY,
    d: style.scaleY,
    tx: 0,
    ty: 0,
  };
}

const applyPoint = (m: Affine, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.tx,
  y: m.b * p.x + m.d * p.y + m.ty,
});

const applyVector = (m: Affine, v: Vec2): Vec2 => ({
  x: m.a * v.x + m.c * v.y,
  y: m.b * v.x + m.d * v.y,
});

export function transformVertex(m: Affine, v: Vertex): Vertex {
  return {
    p: applyPoint(m, v.p),
    inHandle: applyVector(m, v.inHandle),
    outHandle: applyVector(m, v.outHandle),
  };
}

export function transformStroke(m: Affine, s: Stroke): Stroke {
  return { ...s, vertices: s.vertices.map((v) => transformVertex(m, v)) };
}

/** Returns a new glyph with all stroke control points transformed. */
export function transformGlyph(style: StyleSettings, g: Glyph): Glyph {
  const m = affineFromStyle(style);
  return {
    ...g,
    box: { w: g.box.w * style.scaleX, h: g.box.h * style.scaleY },
    strokes: g.strokes.map((s) => transformStroke(m, s)),
  };
}
