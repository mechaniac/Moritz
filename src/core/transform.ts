/**
 * Apply a `StyleSettings` affine transform to a glyph's *control points*
 * (vertex positions and Bézier handles), NOT to its rendered outline.
 *
 * The transform rule from the spec:
 *   When slant/scaleX/scaleY change, we transform every Vertex.p, inHandle,
 *   outHandle, then re-evaluate the Bézier and re-outline. This keeps stroke
 *   thickness uniform under stretch/slant (no smeared widths).
 *
 * Adoption-queue row #3 (see docs/platform-team-wishlist.md): the affine
 * math now delegates to `@christof/sigrid-curves` slice 93
 * (`affineFromGlyphStyle2d` / `transformGlyph2d` / `transformGlyphStroke2d` /
 * `transformGlyphVertex2d` / `transformPoint2d` / `transformVector2d`).
 * Local `Affine` is a type alias of upstream `Affine2d`. Legacy function
 * names are kept as one-line delegations so the four call sites
 * ([core/layout.ts](./layout.ts), [core/bubbleRender.ts](./bubbleRender.ts),
 * [editor/BubbleLayerOverlayEditor.tsx](../editor/BubbleLayerOverlayEditor.tsx),
 * [modules/typesetter/TypeSetter.tsx](../modules/typesetter/TypeSetter.tsx),
 * [modules/glyphsetter/GlyphSetter.tsx](../modules/glyphsetter/GlyphSetter.tsx))
 * don't have to change in lockstep.
 *
 * Affine (in font units, origin at glyph baseline-left of box):
 *
 *   x' = scaleX * x + tan(slant) * scaleY * (y - pivotY)
 *   y' = scaleY * y
 *
 * `pivotY` defaults to 0. `transformGlyph` passes the glyph box mid-height
 * so the slant pivots around the visual center: the top of the glyph leans
 * one way and the bottom the other by equal amounts, keeping the glyph
 * centered in its advance box instead of drifting sideways.
 *
 * Slant uses `tan` so an angle is intuitive (e.g. 12° = mild italic).
 * Handles are deltas relative to their anchor — they transform as vectors
 * (the same matrix without translation).
 */

import {
  type Affine2d,
  affineFromGlyphStyle2d,
  transformGlyph2d,
  transformGlyphStroke2d,
  transformGlyphVertex2d,
} from '@christof/sigrid-curves';
import type { Glyph, Stroke, StyleSettings, Vertex } from './types.js';

export type Affine = Affine2d;

export function affineFromStyle(
  style: StyleSettings,
  slantPivotY = 0,
): Affine {
  // `StyleSettings` is a structural superset of upstream `GlyphLayoutStyle2d`
  // for the three fields we care about (slant / scaleX / scaleY). Other
  // local fields (defaultWidth, widthOrientation, …) are simply ignored.
  return affineFromGlyphStyle2d(style, slantPivotY);
}

export function transformVertex(m: Affine, v: Vertex): Vertex {
  // Local `Vertex` is structurally compatible with `GlyphSplineVertex`
  // (same anchor + handles + breakTangent + normalOverride shape).
  return transformGlyphVertex2d(m, v);
}

export function transformStroke(m: Affine, s: Stroke): Stroke {
  // `transformGlyphStroke2d` does `{ ...stroke, vertices }` — preserves
  // local-only fields (`width`, `capStart`, `capEnd`) untouched.
  return transformGlyphStroke2d(m, s) as Stroke;
}

/**
 * Returns a new glyph with all stroke control points transformed.
 *
 * Pivots the slant around the vertical mid-line of the glyph box (upstream
 * `transformGlyph2d` uses `glyph.box.h / 2` internally) so the visual lean
 * stays centered (top moves right, bottom moves left equally).
 */
export function transformGlyph(style: StyleSettings, g: Glyph): Glyph {
  // Upstream's `{ ...glyph }` spread preserves the Moritz-only fields on
  // `Glyph` (e.g. `worldAngleOffset`); strokes get re-mapped through
  // `transformGlyphStroke2d` which itself preserves stroke-only fields.
  return transformGlyph2d(g, style) as Glyph;
}
