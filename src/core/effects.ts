/**
 * Stochastic effects applied to the rendering pipeline.
 *
 *   spline jitter — perturbs each Vertex.p of every stroke BEFORE outlining,
 *                   so the shape changes coherently (caps and joins follow).
 *   shape jitter  — perturbs the outline polygon vertices AFTER outlining,
 *                   producing wobbly edges without changing topology.
 *
 * Determinism: the seed is derived from the effect's base seed, the active
 * scope, and (for `'instance'`) the glyph's position in the layout. So the
 * same (font, text, effects) tuple always renders identically.
 *
 * All functions are pure and return new objects; inputs are never mutated.
 */

import { hashSeed, mulberry32 } from './random.js';
import type { Glyph, JitterEffect, Stroke, Vec2 } from './types.js';

/** True if the effect should actually run. */
export function jitterActive(e: JitterEffect | undefined): e is JitterEffect {
  return !!e && e.amount > 0;
}

export type JitterContext = {
  readonly instanceIndex: number;
  readonly char: string;
};

/** Compute the per-instance random seed for a jitter effect. */
export function resolveJitterSeed(
  e: JitterEffect,
  ctx: JitterContext,
  salt: number,
): number {
  const scope = e.scope ?? 'instance';
  const base = e.seed ?? 0;
  if (scope === 'text') return hashSeed(base, salt);
  if (scope === 'glyph') {
    let charHash = 0;
    for (let i = 0; i < ctx.char.length; i++) {
      charHash = hashSeed(charHash, ctx.char.charCodeAt(i));
    }
    return hashSeed(base, charHash, salt);
  }
  return hashSeed(base, ctx.instanceIndex, salt);
}

const offset2 = (rnd: () => number, amp: number): Vec2 => ({
  x: (rnd() * 2 - 1) * amp,
  y: (rnd() * 2 - 1) * amp,
});

/**
 * Perturb every anchor point of every stroke by ±amount in x and y.
 * Tangent handles (which are stored relative to the anchor) are left
 * unchanged so the local curvature near each anchor stays the same.
 */
export function jitterGlyphSpline(
  g: Glyph,
  e: JitterEffect,
  seed: number,
): Glyph {
  if (!jitterActive(e)) return g;
  const rnd = mulberry32(seed);
  const strokes: Stroke[] = g.strokes.map((s) => ({
    ...s,
    vertices: s.vertices.map((v) => {
      const d = offset2(rnd, e.amount);
      return { ...v, p: { x: v.p.x + d.x, y: v.p.y + d.y } };
    }),
  }));
  return { ...g, strokes };
}

/**
 * Perturb every outline polygon vertex by ±amount in x and y. Vertex count
 * is preserved, so the original triangle index list (from earcut/ribbon)
 * stays valid against the new vertex array.
 */
export function jitterPolygon(
  poly: readonly Vec2[],
  e: JitterEffect,
  seed: number,
): readonly Vec2[] {
  if (!jitterActive(e) || poly.length === 0) return poly;
  const rnd = mulberry32(seed);
  return poly.map((p) => {
    const d = offset2(rnd, e.amount);
    return { x: p.x + d.x, y: p.y + d.y };
  });
}
