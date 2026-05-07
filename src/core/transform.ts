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
 *   x' = scaleX * x + tan(slant) * scaleY * (y - pivotY)
 *   y' = scaleY * y
 *
 * `pivotY` defaults to 0 (legacy behavior). `transformGlyph` passes the
 * glyph box mid-height so the slant pivots around the visual center: the
 * top of the glyph leans one way and the bottom the other by equal amounts,
 * keeping the glyph centered in its advance box instead of drifting sideways.
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

export function affineFromStyle(
  style: StyleSettings,
  slantPivotY = 0,
): Affine {
  const sh = Math.tan(style.slant);
  // Pivoting the shear around y = slantPivotY keeps that y-line fixed in x,
  // so positive y leans right and negative y leans left equally — the glyph
  // doesn't drift sideways as a whole when slant changes.
  return {
    a: style.scaleX,
    b: 0,
    c: sh * style.scaleY,
    d: style.scaleY,
    tx: -sh * style.scaleY * slantPivotY,
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
    ...(v.breakTangent === true ? { breakTangent: true } : {}),
    ...(v.normalOverride
      ? { normalOverride: applyVector(m, v.normalOverride) }
      : {}),
  };
}

export function transformStroke(m: Affine, s: Stroke): Stroke {
  return { ...s, vertices: s.vertices.map((v) => transformVertex(m, v)) };
}

/** Returns a new glyph with all stroke control points transformed. */
export function transformGlyph(style: StyleSettings, g: Glyph): Glyph {
  // Pivot the slant around the vertical mid-line of the glyph box so the
  // visual lean stays centered (top moves right, bottom moves left equally).
  const m = affineFromStyle(style, g.box.h / 2);
  return {
    ...g,
    box: { w: g.box.w * style.scaleX, h: g.box.h * style.scaleY },
    sidebearings: g.sidebearings
      ? {
          left: g.sidebearings.left * style.scaleX,
          right: g.sidebearings.right * style.scaleX,
        }
      : undefined,
    baselineOffset:
      g.baselineOffset !== undefined ? g.baselineOffset * style.scaleY : undefined,
    strokes: g.strokes.map((s) => transformStroke(m, s)),
  };
}
