/**
 * Centerline-based bubble fill.
 *
 * Bubble layers carry the *exact same* stroke data as glyphs (variable-
 * width Bézier ribbons). The visible "ink" of a bubble is therefore drawn
 * by `outlineStroke()` just like a letter. On top of that, a bubble layer
 * may want a paper-white (or custom) FILL behind the strokes — so the
 * inside of the bubble is opaque, hiding artwork below it on the page.
 *
 * That fill must come from the strokes' *centerlines*, not from their
 * thickened outlines: the artist draws a closed loop with one or more
 * strokes and the system fills the interior. This module turns a list of
 * stroke centerlines into a list of closed polygon loops suitable for an
 * SVG `<path fill=…>`.
 *
 * Algorithm (v1 — deliberately simple, deterministic):
 *
 *   1. Sample every stroke's center-Bézier into a polyline.
 *   2. Greedily chain polylines whose endpoints coincide (within `tol`):
 *      pick a polyline, repeatedly find another whose start or end is
 *      within tolerance of the current chain's end, append it (reversing
 *      where needed). Stop when the chain closes back on its own start
 *      or no more matches exist.
 *   3. Each closed chain becomes one fill polygon. Open chains are
 *      closed with an implicit straight-line `Z` — that is what artists
 *      expect when their hand-drawn loop doesn't quite meet (for the
 *      typical hexagon / cloud / speech outlines this gives the right
 *      visual result).
 *   4. Multiple resulting loops are emitted in their original order
 *      (e.g. a frame + a tail = two loops). The renderer paints them
 *      with a single `<path>` using the even-odd rule so nested loops
 *      cut holes naturally.
 */

import { strokeToSegments, sampleStroke } from './bezier.js';
import type { Stroke, Vec2 } from './types.js';

const SAMPLES_PER_SEGMENT = 12;

/** Squared distance between two points. */
function d2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Sample a single stroke's centerline as a polyline. */
function strokePolyline(stroke: Stroke): Vec2[] {
  const segs = strokeToSegments(stroke);
  if (segs.length === 0) return [];
  const samples = sampleStroke(segs, SAMPLES_PER_SEGMENT);
  return samples.map((s) => ({ x: s.p.x, y: s.p.y }));
}

/**
 * Chain a set of polylines into closed loops by endpoint matching.
 * Returns one polygon per detected loop. Polylines that don't match
 * anyone are still emitted as their own (auto-closed) loop.
 *
 * `tol` is the absolute distance (in glyph units) within which two
 * endpoints are considered the same point.
 */
export function chainPolylinesToLoops(
  polylines: readonly Vec2[][],
  tol: number,
): Vec2[][] {
  const tol2 = tol * tol;
  const remaining = polylines
    .filter((p) => p.length >= 2)
    .map((p) => p.slice());
  const loops: Vec2[][] = [];

  while (remaining.length > 0) {
    let chain = remaining.shift()!;
    let extended = true;
    while (extended) {
      extended = false;
      const chainEnd = chain[chain.length - 1]!;
      const chainStart = chain[0]!;
      // Stop early if the chain has already closed on itself.
      if (chain.length > 2 && d2(chainStart, chainEnd) <= tol2) break;
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i]!;
        const ps = p[0]!;
        const pe = p[p.length - 1]!;
        if (d2(chainEnd, ps) <= tol2) {
          chain = chain.concat(p.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (d2(chainEnd, pe) <= tol2) {
          chain = chain.concat(p.slice(0, -1).reverse());
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (d2(chainStart, pe) <= tol2) {
          chain = p.slice(0, -1).concat(chain);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (d2(chainStart, ps) <= tol2) {
          chain = p.slice().reverse().slice(0, -1).concat(chain);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    loops.push(chain);
  }
  return loops;
}

/**
 * Build closed fill loops for a layer's worth of strokes. Each stroke's
 * centerline is sampled and chained with its neighbours by endpoint
 * matching. The default tolerance scales with the strokes' own bounding
 * box so a hand-drawn hexagon (where vertex meets vertex within a few
 * stroke-widths) closes cleanly.
 */
export function fillLoopsForStrokes(
  strokes: readonly Stroke[],
  tol?: number,
): Vec2[][] {
  if (strokes.length === 0) return [];
  const polylines = strokes.map(strokePolyline).filter((p) => p.length >= 2);
  if (polylines.length === 0) return [];
  // Auto tolerance: 5% of the bounding-box diagonal of all centerlines.
  let auto = tol;
  if (auto === undefined) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pl of polylines) {
      for (const p of pl) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    auto = Math.max(1, diag * 0.05);
  }
  return chainPolylinesToLoops(polylines, auto);
}

/** Convert closed loops to a single SVG path `d` (ready for `fill-rule: evenodd`). */
export function loopsToPath(loops: readonly Vec2[][]): string {
  const parts: string[] = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    parts.push(`M ${loop[0]!.x.toFixed(2)} ${loop[0]!.y.toFixed(2)}`);
    for (let i = 1; i < loop.length; i++) {
      parts.push(`L ${loop[i]!.x.toFixed(2)} ${loop[i]!.y.toFixed(2)}`);
    }
    parts.push('Z');
  }
  return parts.join(' ');
}
