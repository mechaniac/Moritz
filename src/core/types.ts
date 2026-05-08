/**
 * Canonical, immutable, JSON-serializable domain model for Moritz.
 * Everything here is plain data — no methods, no class instances.
 *
 * See `.github/copilot-instructions.md` § 2 for the canonical spec.
 */

export type Vec2 = { readonly x: number; readonly y: number };

/**
 * Illustrator-style anchor.
 *
 * `inHandle` and `outHandle` are stored RELATIVE to `p`. To get the absolute
 * Bézier control point, add the handle to `p`. A zero handle means a corner.
 */
export type Vertex = {
  readonly p: Vec2;
  readonly inHandle: Vec2;
  readonly outHandle: Vec2;
  /**
   * If true, in/out tangents move independently (Illustrator "corner" point
   * with handles, a.k.a. broken tangent). If false / undefined, dragging one
   * handle mirrors the other across `p` (smooth point — opposite handle's
   * direction is reflected, its length is preserved).
   */
  readonly breakTangent?: boolean;
  /**
   * Optional per-anchor normal override. Stored as a vector in glyph space,
   * NOT relative to the tangent. The unit direction of the vector overrides
   * the auto (tangent-perpendicular) normal at this anchor; the LENGTH of
   * the vector overrides the half-width at this anchor (so the renderer
   * uses `|normalOverride|` as the half-width pinned at this vertex).
   *
   * When undefined, the renderer derives both direction and half-width
   * from the path's tangent and the active `WidthProfile`. When defined,
   * the override is converted to a `(deltaAngle, widthFactor)` frame and
   * smoothly interpolated along each segment to its other endpoint's
   * frame. World blend / contract still apply on top of the resulting
   * base normal — the override only sets the per-anchor *baseline*.
   */
  readonly normalOverride?: Vec2;
};

/** Sample on the width(t) profile, t in [0,1] along stroke arc length. */
export type WidthSample = { readonly t: number; readonly width: number };

/** Variable-width profile, linearly interpolated between samples. */
export type WidthProfile = { readonly samples: readonly WidthSample[] };

export type CapShape =
  | 'round'
  | 'flat'
  | 'tapered'
  | { readonly kind: 'custom'; readonly path: readonly Vertex[] };

export type Stroke = {
  readonly id: string;
  /** At least 2 vertices. Cubic-Bézier segments between consecutive vertices. */
  readonly vertices: readonly Vertex[];
  /** Optional override of `StyleSettings.defaultWidth`. */
  readonly width?: WidthProfile;
  readonly capStart?: CapShape;
  readonly capEnd?: CapShape;
};

export type Glyph = {
  /** Single grapheme; matches the key in `Font.glyphs`. */
  readonly char: string;
  /** Glyph ink box in font units (the editing canvas size). */
  readonly box: { readonly w: number; readonly h: number };
  readonly strokes: readonly Stroke[];
  /**
   * Optional per-glyph horizontal padding, in font units (post-style scale).
   * Advance width = `lsb + box.w * scaleX + rsb` (then plus style.tracking).
   * Both default to 0 when undefined.
   */
  readonly sidebearings?: { readonly left: number; readonly right: number };
  /**
   * Vertical offset relative to the baseline, in font units. Positive moves
   * the glyph down. Defaults to 0.
   */
  readonly baselineOffset?: number;
  /**
   * Per-glyph offset (radians) added to `StyleSettings.worldAngle` when
   * rendering this glyph. Lets a single glyph lean its nib without
   * touching the typeface-wide setting. Defaults to 0.
   */
  readonly worldAngleOffset?: number;
  /**
   * Per-glyph offset (radians) added to the effective
   * `StyleSettings.worldContractAngle` (which itself falls back to
   * `worldAngle`) when rendering this glyph. Defaults to 0.
   */
  readonly worldContractAngleOffset?: number;
};

/**
 * `tangent` — width is laid down perpendicular to the path tangent (default).
 * `world`   — width is laid down at a fixed world angle (nib-pen feel).
 */
export type WidthOrientation = 'tangent' | 'world';

export type StyleSettings = {
  /** Italic. Radians. Shears x by tan(slant) * y. */
  readonly slant: number;
  /** Box stretch X (1 = no change). */
  readonly scaleX: number;
  /** Box stretch Y. */
  readonly scaleY: number;
  readonly defaultWidth: WidthProfile;
  /**
   * @deprecated Use `worldBlend` instead. Kept for back-compat with v1
   * fonts. When `worldBlend` is undefined, `widthOrientation === 'world'`
   * resolves to a blend of 1, otherwise 0.
   */
  readonly widthOrientation: WidthOrientation;
  /**
   * 0..1 — blend between tangent-perpendicular width (0, default) and a
   * fixed world-axis nib (1). Intermediate values produce a "leaning nib"
   * that still tracks the spline somewhat. Replaces the old boolean
   * `widthOrientation`. When undefined, the legacy enum is consulted.
   */
  readonly worldBlend?: number;
  /**
   * 0..1 — world-axis width contraction. Independent of `worldBlend`.
   * Scales the local half-width by a factor that depends on how aligned
   * the (already-blended) normal is with `worldAngle`'s perpendicular.
   * 0 = no contraction (default), 1 = full contraction (zero width when
   * the normal is perpendicular to the world normal). Mimics a chisel
   * nib whose thickness collapses in one world direction.
   */
  readonly worldContract?: number;
  /** Used for world-blend (`worldBlend > 0`). Radians. */
  readonly worldAngle: number;
  /**
   * Used for world-contract (`worldContract > 0`). Radians. When omitted,
   * falls back to `worldAngle` (single-knob legacy behavior). Splitting
   * this from `worldAngle` lets the user lay the chisel along one axis
   * (blend) while contracting along a different one (contract).
   */
  readonly worldContractAngle?: number;
  readonly capStart: CapShape;
  readonly capEnd: CapShape;
  /**
   * Roundness of `'round'` caps. 1 = true semicircle (default). <1 flattens
   * the cap toward the chord; >1 pushes the cap further past the endpoint.
   * Only affects caps whose resolved kind is `'round'`.
   */
  readonly capRoundBulge?: number;
  /**
   * Triangulation algorithm used by all renderers (StyleSetter preview,
   * GlyphSetter preview, SVG export).
   *   - 'earcut'         : minimal ear-clipping of the outline polygon.
   *   - 'ribbon-fixed'   : quad strip with N samples per Bezier segment.
   *   - 'ribbon-density' : quad strip with density-driven subdivision.
   */
  readonly triMode?: TriMode;
  /** When triMode === 'ribbon-fixed': samples per Bezier segment (≥0). */
  readonly ribbonSamples?: number;
  /** When triMode === 'ribbon-density': spacing in glyph units. */
  readonly ribbonSpacing?: number;
  /** 0..1 — parameter-uniform vs arc-length-uniform interior sample placement. */
  readonly ribbonSpread?: number;
  /** 0..1 — bias samples toward anchors with active tangents. */
  readonly ribbonAnchorPull?: number;
  /**
   * Ribbon: vertices added BETWEEN each pair of spline0 anchors when
   * building spline1 (the spine). 0 = anchors only. Integer.
   */
  readonly ribbonSpineSubdiv?: number;
  /**
   * Ribbon: when true, distribute spine subdivisions according to each
   * segment's arc length instead of giving every segment the same count.
   * The step size is derived from the global `ribbonSpineSubdiv` applied
   * to the *average* segment length, so longer segments get more interior
   * vertices and shorter ones get fewer. Each segment still receives an
   * integer count and its own samples remain arc-length-uniform within
   * the segment.
   */
  readonly ribbonSpineLengthAware?: boolean;
  /**
   * Ribbon: vertices added between each pair of border-polyline vertices
   * when building the actual shape vertices. 0 = no extra subdivision.
   * Integer.
   */
  readonly ribbonBorderSubdiv?: number;
  /** Ribbon: round-cap fan steps. Integer ≥ 1. Default = spineSubdiv + 2. */
  readonly ribbonCapSubdiv?: number;
  /**
   * Ribbon: extra spline1 samples added on EACH side of any anchor whose
   * `breakTangent` is true (i.e. corner anchors). Each iteration halves
   * the gap between the closest existing sample and the broken anchor,
   * so vertex density grows geometrically toward the corner. 0 = off.
   * Integer.
   */
  readonly ribbonBrokenAnchorSubdiv?: number;
  /**
   * 0..1 — redistributes the outline polygon's vertices along its perimeter
   * by arc length. 0 = leave untouched, 1 = perfectly uniform spacing.
   * Applied only in `'earcut'` triMode (the polygon is re-triangulated after
   * resampling). Useful when world-blend strokes pinch their natural sample
   * spacing and triangles begin to overlap.
   */
  readonly vertexEvenness?: number;
  /**
   * 0..1 — relax (Laplacian-smooth) the rendered shape polygon while
   * pinning user-defined anchor positions. Higher values = more
   * iterations + bigger per-iteration step. Smooths high-frequency
   * wobble introduced by extreme tangent or width settings. Applied in
   * BOTH earcut and ribbon modes; in ribbon mode anchor positions on
   * both borders are preserved exactly.
   */
  readonly relaxCurves?: number;
  /**
   * 0..1 — relax tangents by sliding each non-anchor polygon vertex
   * toward the arc-length midpoint of its two neighbors (along their
   * chord). Equalizes edge spacing and removes perpendicular wobble.
   * Pinned anchors anchor the chord. Applied in BOTH earcut and ribbon
   * modes.
   */
  readonly relaxTangents?: number;

  // ---- Spacing & metrics (all in font units; all optional w/ sane defaults) ---

  /** Extra horizontal space added between every pair of glyphs. Default 0. */
  readonly tracking?: number;
  /** Width of a literal space character. Default = 0.4 * line height. */
  readonly spaceWidth?: number;
  /** Multiplier on the tallest glyph for line stepping. Default 1.2. */
  readonly lineHeight?: number;

  // ---- Effects (optional, all default to off) ------------------------------

  /** Stochastic perturbations applied during layout / rendering. */
  readonly effects?: EffectsSettings;
};

export type TriMode = 'earcut' | 'ribbon-fixed' | 'ribbon-density';

/**
 * Re-roll bucket for a stochastic effect.
 *   - `'instance'` : every glyph occurrence gets its own random offsets
 *                    (each set 'a' looks slightly different).
 *   - `'glyph'`    : every occurrence of the same character shares the
 *                    same offsets (all 'a's identical, but different from 'b's).
 *   - `'text'`     : a single random offset set is applied everywhere.
 */
export type EffectScope = 'instance' | 'glyph' | 'text';

/**
 * Random per-vertex displacement, uniform in the square ±amount.
 * `amount === 0` disables the effect (treated as undefined).
 */
export type JitterEffect = {
  readonly amount: number; // font units
  readonly scope?: EffectScope; // default 'instance'
  readonly seed?: number; // default 0
};

export type EffectsSettings = {
  /** Perturb each Vertex.p before stroke outlining. Handles unchanged. */
  readonly splineJitter?: JitterEffect;
  /** Perturb each outline polygon vertex after stroke outlining. */
  readonly shapeJitter?: JitterEffect;
  /** Random multiplicative wobble of the stroke width along its arc length. */
  readonly widthWiggle?: WidthWiggle;
  /** Deterministic taper applied as a width multiplier along the stroke. */
  readonly widthTaper?: WidthTaper;
};

/**
 * Width multiplied by `1 + amount * noise(arcDistance * frequency)`, where
 * noise is a value-noise sequence in [-1, 1] seeded by (seed, scope, ctx).
 *
 *   amount    : magnitude of the wobble (0 = off, typical 0..1).
 *   frequency : cycles per font unit along the stroke arc (0..1 typical).
 */
export type WidthWiggle = {
  readonly amount: number;
  readonly frequency: number;
  readonly scope?: EffectScope; // default 'instance'
  readonly seed?: number;
};

/**
 * Multiplicative ramp from `start` at the stroke start to `end` at the
 * stroke end (in normalized arc t, 0..1).
 *
 *   mode === 'stroke' : the ramp spans the whole stroke (default).
 *   mode === 'length' : the ramp REPEATS every `length` font units of arc
 *                       so all strokes get the same physical taper period
 *                       regardless of length.
 */
export type WidthTaper = {
  readonly start: number;
  readonly end: number;
  readonly mode?: 'stroke' | 'length'; // default 'stroke'
  readonly length?: number;            // required for mode === 'length'
};

export type Font = {
  readonly id: string;
  readonly name: string;
  readonly style: StyleSettings;
  /** Keyed by single-character string. */
  readonly glyphs: Readonly<Record<string, Glyph>>;
  /**
   * Typeface-wide kerning table. Keyed by the 2-character pair (e.g. `"AV"`).
   * Value is added to the advance between the first and second character of
   * the pair (font units, pre-style-scale; layout multiplies by scaleX).
   * Negative tightens, positive opens up.
   */
  readonly kerning?: Readonly<Record<string, number>>;
};

// ---------- Trivial constructors / constants (pure) ---------------------------

export const v2 = (x: number, y: number): Vec2 => ({ x, y });

export const ZERO: Vec2 = { x: 0, y: 0 };

/** Constant-width profile of `w`. */
export const constantWidth = (w: number): WidthProfile => ({
  samples: [
    { t: 0, width: w },
    { t: 1, width: w },
  ],
});

// ---------- Ribbon-mode defaults --------------------------------------------
// These are the values used when a StyleSettings leaves the corresponding
// field undefined. Keep them in one place so UI fallbacks, the rendering
// pipeline (svg/png export, GlyphSetter previews) and the StyleSetter
// "reset to default" indicator all agree.

export const DEFAULT_RIBBON_SPINE_SUBDIV = 9;
export const DEFAULT_RIBBON_CAP_SUBDIV = 6;
/** Length-aware spine defaults to ON: a missing field reads as `true`. */
export const DEFAULT_RIBBON_SPINE_LENGTH_AWARE = true;

export function ribbonSpineSubdivOf(s: StyleSettings): number {
  return s.ribbonSpineSubdiv ?? s.ribbonSamples ?? DEFAULT_RIBBON_SPINE_SUBDIV;
}

export function ribbonCapSubdivOf(s: StyleSettings): number {
  return s.ribbonCapSubdiv ?? DEFAULT_RIBBON_CAP_SUBDIV;
}

export function ribbonSpineLengthAwareOf(s: StyleSettings): boolean {
  return s.ribbonSpineLengthAware ?? DEFAULT_RIBBON_SPINE_LENGTH_AWARE;
}
