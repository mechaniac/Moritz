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
  /**
   * Optional pure-data animator component for this glyph. A font is a
   * collection; the glyph is the smallest universal, drawable unit. Animation
   * therefore belongs here, not on the font container.
   */
  readonly animator?: GlyphAnimatorComponent;
};

export type GlyphAnimatorSymbol = {
  readonly id: string;
  /** Optional normalized offset from this symbol's base slot. */
  readonly offset?: number;
};

export type GlyphAnimatorComponent = {
  readonly id: string;
  readonly kind: 'symbol-along-stroke';
  readonly symbols: readonly GlyphAnimatorSymbol[];
  readonly strokeIds?: readonly string[];
  readonly samplesPerSegment?: number;
  /** Normalized phase added to every symbol. */
  readonly phase?: number;
  /** Normalized arc units per time unit. */
  readonly speed?: number;
  readonly direction?: 1 | -1;
  readonly spacing?: number;
  readonly loop?: boolean;
  readonly easing?: 'linear' | 'smoothstep';
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
  /**
   * The font's bundled default style. Always present in-memory (load
   * supplies `defaultStyleSettings` if a saved envelope omitted it). On
   * disk this field is optional in the envelope: the canonical style is
   * now a separate `Style` save file (see below) and new font envelopes
   * may skip the field entirely. Treated as the boot-time style only;
   * once a `Style` is loaded the store's `style` slice takes over.
   */
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
  /**
   * Per-font glyph defaults (applied to every glyph, not per-glyph).
   * Currently just the editing/preview guides; future per-font glyph-wide
   * settings (default sidebearings, baseline, em-grid, …) live here too.
   */
  readonly guides?: GuideSettings;
};

/**
 * Style — universal, font-agnostic save file. A `Style` is a complete
 * `StyleSettings` plus identity. It can be loaded onto any font: the
 * settings describe the *shape/material/shader*, never the per-glyph
 * geometry. Persistence: one `.style.moritz.json` file per Style.
 */
export type Style = {
  readonly id: string;
  readonly name: string;
  readonly settings: StyleSettings;
};

/**
 * Page — a TypeSetter scene saved as a single self-contained file.
 *
 * Canonical save shape (`PageEnvelope` v2). The page carries everything
 * needed to render itself: page dimensions, optional background image,
 * a flat list of blocks, and a `library` snapshot of every Font / Style
 * / BubbleFont referenced by those blocks. This makes the file
 * **portable**: opening it on another machine never needs external
 * assets.
 *
 * Persistence: one `.page.moritz.json` file per Page.
 */
export type Page = {
  readonly id: string;
  readonly name: string;
  readonly w: number;
  readonly h: number;
  /** Optional comic page image as a data URL. */
  readonly background?: string;
  readonly blocks: readonly Block[];
  readonly library: PageLibrary;
};

/**
 * Snapshot of every fontish artefact referenced by the page. Stored
 * inside the Page so the file is self-contained. Indexed by stable id
 * so a `TextRun.fontId` / `BlockBubble.styleId` etc. resolves locally.
 */
export type PageLibrary = {
  readonly fonts: Readonly<Record<string, Font>>;
  readonly styles: Readonly<Record<string, Style>>;
  readonly bubbleFonts: Readonly<Record<string, BubbleFont>>;
};

/**
 * One placement on the page: a frame (x, y, w, h), an optional
 * speech-bubble background, and one or more text runs that share the
 * frame. The frame is in page units (px), top-left origin.
 *
 * When a `bubble` is present the bubble fills the block frame; the
 * text runs render on top, clipped/aligned by the inspector.
 */
export type Block = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly bubble?: BlockBubble;
  /** At least one run. Multi-run support is reserved for the future
   *  per-text font/style picker; today every block ships exactly one. */
  readonly texts: readonly TextRun[];
};

/**
 * One styled run of text inside a Block.
 *
 * Carries its own `fontId` + `styleId` (resolved against
 * `Page.library`) so a single page can mix any number of fonts and
 * styles without per-block overrides. `boldFactor` and `slantDelta`
 * are parameter modulations on top of the referenced style — we never
 * ship separate "bold" / "italic" cuts.
 */
export type TextRun = {
  readonly id: string;
  readonly text: string;
  readonly fontId: string;     // → Page.library.fonts
  readonly styleId: string;    // → Page.library.styles
  /** Page-unit glyph height. */
  readonly fontSize: number;
  readonly align?: 'left' | 'center' | 'right';
  /** Multiplier on stroke width. Default 1. */
  readonly boldFactor?: number;
  /** Radians added to the referenced style's slant. Default 0. */
  readonly slantDelta?: number;
};

/**
 * The bubble drawn behind a block. Either references a preset bubble
 * inside the page library, OR carries one of the legacy programmatic
 * shapes (`'rect' | 'speech' | 'cloud'`). The discriminated `source`
 * keeps the two cleanly separated; future versions may convert the
 * legacy shapes into actual preset bubbles and drop the second arm.
 */
export type BlockBubble = {
  readonly source: BlockBubbleSource;
  /** Style used to render the bubble's strokes. → Page.library.styles */
  readonly styleId: string;
  /** Outline width multiplier in page units. */
  readonly stroke: number;
  /** Tail tip in block-local coords (page units, 0,0 = block top-left). */
  readonly tailX: number;
  readonly tailY: number;
};

export type BlockBubbleSource =
  | {
      readonly kind: 'preset';
      readonly bubbleFontId: string;            // → Page.library.bubbleFonts
      readonly bubbleId: string;                // key inside that BubbleFont
      /** Per-instance snapshot (clone-on-edit). When present, overrides
       *  the lookup so the user can edit the bubble locally without
       *  touching the preset. Cleared to fall back to the preset. */
      readonly override?: Bubble;
    }
  | {
      readonly kind: 'shape';
      readonly shape: 'rect' | 'speech' | 'cloud';
    };

// ---- Legacy shape (envelope v1) -------------------------------------------
// Kept ONLY for migrating saved files. New code MUST use `Page` (above).
// The persistence layer converts v1 envelopes to the canonical shape on
// load via `core/page.ts`.

/** @deprecated Use `Page`. v1 envelope shape only. */
export type LegacyPage = {
  readonly id: string;
  readonly name: string;
  readonly pageW: number;
  readonly pageH: number;
  readonly background?: string;
  readonly blocks: readonly LegacyTextBlock[];
};

/** @deprecated Use `Block` + `TextRun`. v1 envelope shape only. */
export type LegacyTextBlock = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly text: string;
  readonly bold: number;
  readonly italic: number;
  readonly shape: string;
  readonly bubbleW: number;
  readonly bubbleH: number;
  readonly tailX: number;
  readonly tailY: number;
  readonly bubbleStroke: number;
  readonly align?: 'left' | 'center' | 'right';
  /** Per-block font reference. v1 envelopes never wrote this field; it
   *  only appears on runtime blocks coming back from a v2 round-trip. */
  readonly fontId?: string;
  /** Per-block style reference. Same v1/v2 story as `fontId`. */
  readonly styleId?: string;
  readonly bubblePresetId?: string;
  readonly bubble?: Bubble;
};

/** @deprecated Use `LegacyTextBlock`. */
export type TextBlockData = LegacyTextBlock;

/**
 * Forward declaration: the actual `GuideSettings` type lives in
 * `modules/glyphsetter/guides.ts` (it is UI-shaped data, not part of the
 * core renderer). We intentionally type it as `unknown` here to avoid an
 * import cycle from `core/` into `modules/`. Consumers cast on read.
 */
export type GuideSettings = Readonly<Record<string, unknown>>;

// ---------- Bubbles ---------------------------------------------------------
//
// A Bubble is a multi-layer composition that lives on a "page-relative"
// reference grid. Every layer carries its OWN glyph-shaped artwork
// (strokes, vertices) so the same editor used for letters can be reused
// to draw a bubble's frame, tail, droplets, etc. — only the surrounding
// metadata differs.
//
// Layout model:
//   - A Bubble has a unit `box` (e.g. 200×140). Each layer is placed by
//     (anchorX, anchorY) ∈ [0,1]² inside the box (gridded for snapping)
//     plus an `offset` in box units, plus a `scale` so a layer can be
//     scaled independently of its sibling.
//   - At render time on the page the layers are scaled together to the
//     placed bubble size (pageW × pageH); per-layer (offset, scale) lets
//     the user live-adjust e.g. the "tail" alone while leaving the
//     "frame" untouched.
//
// Persistence: one `.bubble.moritz.json` envelope per BubbleFont (a
// preset library), keeping the same shape as a Font.

/** Optional fill for a bubble layer. `none` = stroked outline only. */
export type FillSettings = {
  readonly mode: 'none' | 'paper' | 'ink' | 'custom';
  /** Hex color, used only when `mode === 'custom'`. */
  readonly color?: string;
  /** 0..1, default 1. */
  readonly opacity?: number;
};

/**
 * One layer in a Bubble. Conceptually a Glyph drawn at a specific
 * position/scale on the bubble's grid, plus paint settings.
 */
export type BubbleLayer = {
  readonly id: string;
  readonly name: string;
  /** Drawing data — same shape as a glyph so the spline editor reuses. */
  readonly glyph: Glyph;
  /** Anchor on the bubble's reference grid, both axes in [0,1]. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Extra translation in bubble-box units, on top of the anchor. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Per-layer uniform scale (1 = native). */
  readonly scale: number;
  /** Optional rotation in radians. */
  readonly rotate?: number;
  /** Fill settings for this layer's outline. */
  readonly fill?: FillSettings;
  /** Visible? Lets the user temporarily hide a layer in the editor. */
  readonly visible?: boolean;
  /**
   * Tag identifying this layer's role on the page so per-instance
   * adjustments in TypeSetter can target it (e.g. `'frame'`, `'tail'`).
   * Free-form string.
   */
  readonly role?: string;
};

/** A single bubble preset, multi-layered. */
export type Bubble = {
  /** Stable identifier inside a BubbleFont (the dictionary key). */
  readonly id: string;
  /** Human-friendly label shown in the picker. */
  readonly name: string;
  /** Reference box in bubble units. Layers are positioned within this. */
  readonly box: { readonly w: number; readonly h: number };
  /** Grid divisions for snapping in the editor (>=1). */
  readonly grid?: { readonly cols: number; readonly rows: number };
  readonly layers: readonly BubbleLayer[];
  /**
   * Placeholder text shown inside the bubble in the editor / preview so
   * the artist can judge the bubble's interior whitespace against real
   * lettering. Not rendered when the bubble is placed on a page (the
   * page's own text takes its place).
   */
  readonly dummyText?: string;
};

/**
 * BubbleFont — a library of bubble presets, mirrors the Font shape so
 * the same persistence machinery (envelopes, dev-folder writer, etc.)
 * can be reused with minimal special-casing. The contained `style` is
 * the bubble-library's default rendering style; per-bubble it can be
 * overridden later (out of scope for v1).
 */
export type BubbleFont = {
  readonly id: string;
  readonly name: string;
  readonly style: StyleSettings;
  readonly bubbles: Readonly<Record<string, Bubble>>;
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
