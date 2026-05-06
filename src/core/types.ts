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
  /** Used whenever `worldBlend > 0`. Radians. */
  readonly worldAngle: number;
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
