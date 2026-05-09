/**
 * Pure SVG-fragment renderer for a multi-layer `Bubble`. Used by the
 * TypeSetter to draw a placed bubble using the artwork from the active
 * BubbleFont (the same artwork that's editable in BubbleSetter).
 *
 * Inputs are pure data (Bubble + StyleSettings + target box), output is
 * a string SVG fragment plus a tight bounding box. Stays inside `core/`
 * so TypeSetter (and any future exporter) can use it without going via
 * React.
 *
 * Coordinate system & the **bubble transform rule**:
 *   - The bubble's own coordinate space is `0 .. bubble.box.{w,h}`.
 *   - Stretching the bubble to a `(targetW, targetH)` rectangle does
 *     *not* SVG-scale the rendered output (which would also fatten the
 *     ink strokes). Instead we apply a non-uniform `(sx, sy)` affine
 *     to every glyph's *control vertices* and *layer placement*, then
 *     re-outline each stroke with its original (source-units) widths.
 *     This is the same rule glyphs follow when slant/scaleX/scaleY
 *     change: deform the construction curves, then redraw the ink.
 *     Two bubbles at different display sizes therefore get identical
 *     stroke widths in pixels at the same zoom.
 *
 * Rendering rules per layer (mirror of `BubbleSetter.LayerPolygons`):
 *   - Fill: spline0 only. Decorative inner strokes do not contribute to
 *     the filled interior.
 *   - Stroke: every stroke is outlined via `outlineStroke()` (variable
 *     width Bézier ribbon).
 *   - Layers with `visible === false` are skipped.
 */

import type { Bubble, BubbleLayer, Glyph, StyleSettings, Vec2 } from './types.js';
import { effectiveStyleForGlyph, outlineStroke } from './stroke.js';
import { fillLoopsForStrokes, loopsToPath } from './bubbleFill.js';
import { transformStroke, type Affine } from './transform.js';

/** Default ink colour. The TypeSetter wraps the fragment in a `<g>` that
 *  can override these via `currentColor` if needed. */
const INK = 'black';
/** Default fill colour used for `mode === 'paper'`. */
const PAPER = 'white';

const fmt = (n: number): string => Number(n.toFixed(2)).toString();

/** Minimal escape for an SVG attribute value (layer ids are short and
 *  user-controlled; strict enough to avoid breaking the surrounding
 *  attribute string). */
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function polygonToPath(poly: readonly Vec2[]): string {
  if (poly.length === 0) return '';
  const parts: string[] = [`M ${fmt(poly[0]!.x)} ${fmt(poly[0]!.y)}`];
  for (let i = 1; i < poly.length; i++) {
    parts.push(`L ${fmt(poly[i]!.x)} ${fmt(poly[i]!.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function fillColorForLayer(l: BubbleLayer): string | null {
  const f = l.fill;
  if (!f || f.mode === 'none') return null;
  if (f.mode === 'paper') return PAPER;
  if (f.mode === 'ink') return INK;
  return f.color ?? PAPER;
}

/**
 * Where the layer's local origin lands in the bubble's own coordinate
 * space (i.e. before any (sx, sy) box stretch). Mirror of the helper
 * in `BubbleSetter`.
 */
function layerTransform(b: Bubble, l: BubbleLayer): { tx: number; ty: number; s: number } {
  const ax = b.box.w * l.anchorX;
  const ay = b.box.h * l.anchorY;
  const tx = ax + l.offsetX - (l.glyph.box.w * l.scale) / 2;
  const ty = ay + l.offsetY - (l.glyph.box.h * l.scale) / 2;
  return { tx, ty, s: l.scale };
}

/**
 * Return a copy of `g` with every stroke vertex pre-multiplied by the
 * non-uniform scale `(sx, sy)`. Stroke widths are *not* touched, so the
 * rendered ink stays the same thickness regardless of how stretched the
 * bubble is. This is the core of the bubble transform rule.
 */
function scaleGlyphVertices(g: Glyph, sx: number, sy: number): Glyph {
  if (sx === 1 && sy === 1) return g;
  const m: Affine = { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
  return { ...g, strokes: g.strokes.map((s) => transformStroke(m, s)) };
}

export type BubbleSvgFragment = {
  /** SVG fragment string (no outer `<svg>`). Coordinates are in the
   *  *target* (bubbleW × bubbleH) box. */
  body: string;
  /** Tight bounding box of the fragment in target coords. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Render one Bubble preset into an SVG fragment, scaled to fit the given
 * target box. The target box's top-left is (0, 0). See module header for
 * the transform rule (vertex deformation, constant stroke widths).
 */
export function renderBubbleToSvgFragment(
  bubble: Bubble,
  style: StyleSettings,
  targetW: number,
  targetH: number,
): BubbleSvgFragment {
  const sx = bubble.box.w > 0 ? targetW / bubble.box.w : 1;
  const sy = bubble.box.h > 0 ? targetH / bubble.box.h : 1;
  const parts: string[] = [];
  // Track the true bbox in *target* coordinates. Lower-bound to the
  // nominal target rect so an empty bubble still has a draggable area.
  let minX = 0;
  let minY = 0;
  let maxX = targetW;
  let maxY = targetH;
  const acc = (xLocal: number, yLocal: number, tx: number, ty: number, s: number): void => {
    // (xLocal, yLocal) is already in box-stretched units, so no further
    // (sx, sy) is needed here — the layer translate/scale is also in
    // stretched units. See the per-layer block below.
    const X = tx + xLocal * s;
    const Y = ty + yLocal * s;
    if (X < minX) minX = X;
    if (Y < minY) minY = Y;
    if (X > maxX) maxX = X;
    if (Y > maxY) maxY = Y;
  };
  for (const layer of bubble.layers) {
    if (layer.visible === false) continue;
    // Pre-stretch the layer's glyph control vertices by (sx, sy). The
    // stroke widths in the glyph are left alone, so the variable-width
    // ribbon emitted by `outlineStroke` keeps its source-units thickness.
    const scaledGlyph = scaleGlyphVertices(layer.glyph, sx, sy);
    // The layer's anchor/offset are also in source bubble-box units, so
    // they have to be stretched the same way.
    const { tx: txSrc, ty: tySrc } = layerTransform(bubble, layer);
    const tx = txSrc * sx;
    const ty = tySrc * sy;
    const s = layer.scale; // per-layer uniform scale (still SVG-applied)
    const opacity = layer.fill?.opacity ?? 1;
    // `data-layer-id` + explicit pointer-events lets the TypeSetter
    // delegate clicks back to the layer (Principle 6: any element
    // directly selectable). The wrapper div upstream is
    // `pointer-events: none`, so without the explicit attribute here the
    // strokes would inherit non-interactivity.
    parts.push(
      `<g data-layer-id="${escapeAttr(layer.id)}" pointer-events="visiblePainted" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(s)})" opacity="${fmt(opacity)}">`,
    );
    // Fill (spline0 only).
    const fillColor = fillColorForLayer(layer);
    if (fillColor) {
      const first = scaledGlyph.strokes[0];
      if (first) {
        const loops = fillLoopsForStrokes([first]);
        const d = loopsToPath(loops);
        if (d) {
          parts.push(
            `<path d="${d}" fill="${fillColor}" fill-rule="evenodd" stroke="none" />`,
          );
          for (const loop of loops) {
            for (const p of loop) acc(p.x, p.y, tx, ty, s);
          }
        }
      }
    }
    // Strokes — outlined with their original widths against the
    // (vertex-stretched) glyph.
    const gStyle = effectiveStyleForGlyph(style, scaledGlyph);
    for (const stk of scaledGlyph.strokes) {
      const poly = outlineStroke(stk, gStyle);
      const d = polygonToPath(poly);
      if (d) {
        parts.push(`<path d="${d}" fill="${INK}" stroke="none" />`);
        for (const p of poly) acc(p.x, p.y, tx, ty, s);
      }
    }
    parts.push(`</g>`);
  }
  return {
    body: parts.join(''),
    minX,
    minY,
    maxX,
    maxY,
  };
}
