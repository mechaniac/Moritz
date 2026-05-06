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
  /** Glyph advance box in font units. */
  readonly box: { readonly w: number; readonly h: number };
  readonly strokes: readonly Stroke[];
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
  readonly widthOrientation: WidthOrientation;
  /** Used only when `widthOrientation === 'world'`. Radians. */
  readonly worldAngle: number;
  readonly capStart: CapShape;
  readonly capEnd: CapShape;
  /**
   * Roundness of `'round'` caps. 1 = true semicircle (default). <1 flattens
   * the cap toward the chord; >1 pushes the cap further past the endpoint.
   * Only affects caps whose resolved kind is `'round'`.
   */
  readonly capRoundBulge?: number;
};

export type Font = {
  readonly id: string;
  readonly name: string;
  readonly style: StyleSettings;
  /** Keyed by single-character string. */
  readonly glyphs: Readonly<Record<string, Glyph>>;
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
