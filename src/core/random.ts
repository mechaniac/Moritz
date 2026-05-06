/**
 * Tiny deterministic PRNG + integer hash.
 *
 * Pure: no Math.random, no Date.now. Used by the effects pipeline so the
 * "randomized" rendering of any (font, text, seed) tuple is fully stable —
 * the same inputs always produce the same SVG.
 */

/** mulberry32 — 32-bit state, ~uniform output in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a-style mix of any number of integers into a single 32-bit seed. */
export function hashSeed(...nums: readonly number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  // extra avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
