/**
 * Width-modulation effects for the stroke outliner.
 *
 *   widthTaper  — deterministic ramp (mode 'stroke' = once across the whole
 *                 stroke; mode 'length' = repeats every `length` font units).
 *   widthWiggle — random multiplicative wobble using cosine-interpolated
 *                 value noise seeded per (instance/glyph/text) × stroke.
 *
 * Both fold into a single `WidthMod = (tArc) => multiplier` that the
 * outliner multiplies into `widthAt(profile, tArc)`. When no width effects
 * are active `makeWidthMod` returns null and the outliner takes a fast path.
 */

import { hashSeed, mulberry32 } from './random.js';
import type { JitterContext } from './effects.js';
import type { StyleSettings, WidthTaper, WidthWiggle } from './types.js';

export type WidthMod = (tArc: number) => number;

const WIGGLE_NODES = 16;

function makeWiggle(w: WidthWiggle, ctx: JitterContext, arcLen: number): WidthMod {
  const scope = w.scope ?? 'instance';
  const base = w.seed ?? 0;
  const seed =
    scope === 'text'
      ? hashSeed(base, 0xdada)
      : scope === 'glyph'
        ? hashSeed(base, charHash(ctx.char), 0xdada)
        : hashSeed(base, ctx.instanceIndex, 0xdada);
  const rnd = mulberry32(seed);
  // Pre-roll a small node array; cosine-interpolate between nodes by
  // arc-distance / period, where period = 1 / frequency (in font units).
  const nodes = new Array<number>(WIGGLE_NODES);
  for (let i = 0; i < WIGGLE_NODES; i++) nodes[i] = rnd() * 2 - 1;
  const period = 1 / Math.max(1e-6, w.frequency);
  return (tArc) => {
    const dist = tArc * arcLen;
    const u = dist / period; // node units
    const i = Math.floor(u);
    const f = u - i;
    const a = nodes[((i % WIGGLE_NODES) + WIGGLE_NODES) % WIGGLE_NODES]!;
    const b = nodes[(((i + 1) % WIGGLE_NODES) + WIGGLE_NODES) % WIGGLE_NODES]!;
    // cosine interpolation
    const k = 0.5 - 0.5 * Math.cos(Math.PI * f);
    const n = a * (1 - k) + b * k; // ∈ [-1, 1]
    return 1 + w.amount * n;
  };
}

function makeTaper(t: WidthTaper, arcLen: number): WidthMod {
  const mode = t.mode ?? 'stroke';
  if (mode === 'length') {
    const period = Math.max(1e-6, t.length ?? arcLen);
    return (tArc) => {
      const dist = tArc * arcLen;
      const u = (dist / period) % 1;
      return t.start + (t.end - t.start) * u;
    };
  }
  return (tArc) => t.start + (t.end - t.start) * tArc;
}

function charHash(ch: string): number {
  let h = 0;
  for (let i = 0; i < ch.length; i++) h = hashSeed(h, ch.charCodeAt(i));
  return h;
}

/**
 * Compose any active width effects into a single multiplier function. Returns
 * null when no effects apply (caller takes fast path: width = profile only).
 *
 *   arcLen : total arc length of the stroke being outlined, in font units.
 *            Used to convert the unitless `tArc ∈ [0,1]` parameter into a
 *            distance for wiggle frequency and length-mode taper period.
 */
export function makeWidthMod(
  style: StyleSettings,
  ctx: JitterContext,
  arcLen: number,
): WidthMod | null {
  const fx = style.effects;
  if (!fx) return null;
  const wiggleActive = fx.widthWiggle && fx.widthWiggle.amount > 0;
  const taperActive =
    fx.widthTaper && (fx.widthTaper.start !== 1 || fx.widthTaper.end !== 1);
  if (!wiggleActive && !taperActive) return null;
  const wiggleFn = wiggleActive ? makeWiggle(fx.widthWiggle!, ctx, arcLen) : null;
  const taperFn = taperActive ? makeTaper(fx.widthTaper!, arcLen) : null;
  if (wiggleFn && taperFn) return (t) => wiggleFn(t) * taperFn(t);
  return wiggleFn ?? taperFn!;
}
