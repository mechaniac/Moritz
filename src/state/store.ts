/**
 * Zustand store. Thin wrapper around the immutable domain.
 *
 * The renderer always uses `state.style` (a full `StyleSettings`), never
 * `state.font.style`. A Style is now an independent save file
 * (see `core/types.ts → Style`); on font load we seed `style` from
 * `font.style` for back-compat, and on Style-file load we replace it.
 * `loadedStyleSettings` snapshots whatever was just loaded so the
 * "modified" markers and bulk-reset have a stable baseline to compare
 * against.
 */

import { create } from 'zustand';
import { defaultFont, withCommonGlyphFallback } from '../data/defaultFont.js';
import type { Font, Glyph, StyleSettings } from '../core/types.js';
import { defaultGuides, type GuideSettings } from '../modules/glyphsetter/guides.js';

export type ModuleId = 'glyphsetter' | 'bubblesetter' | 'stylesetter' | 'typesetter';

export type GlyphViewOptions = {
  showAnchors: boolean;
  showFillPreview: boolean;
  fillOpacity: number; // 0..1; opacity of the fill preview
  /** Opacity multiplier for ink stroke polygons (0..1). Used by the
   *  BubbleSetter (which reuses the GlyphEditor) so the active layer's
   *  ink can be faded; in glyph mode it stays at 1. */
  strokeOpacity: number;
  showOtherGlyphs: boolean; // overlay all other glyphs' fills behind the edited one
  showBorders: boolean; // colorized debug overlay of left/right/caps
  showTriangles: boolean; // overlay of the active triangulation
  showSpline0: boolean; // overlay of the user-defined center spline + tangents (debug)
  showSpline1: boolean; // overlay of the subdivided spine + per-vertex normals (debug)
  /** System/web font shown faintly behind the edited glyph as a tracing
   *  reference. Empty string = none. */
  refFontFamily: string;
  refFontOpacity: number; // 0..1
  /** Pixels-per-font-unit zoom in the glyph editor canvas. */
  editorScale: number;
  /** Pan offset of the editor canvas, in screen pixels. (0,0) = artwork
   *  centred in the viewport. Updated by space/middle-mouse drag. */
  panX: number;
  panY: number;
  /** Show a horizontal lined-paper grid at the active style's line
   *  height across the editor canvas. Used by BubbleSetter to judge
   *  paragraph fit inside a bubble. */
  showLineGrid: boolean;
  /**
   * Live guides (calligraphy lines, golden grid, columns…). Mirrors
   * `font.guides` while editing; a font load syncs this from the loaded
   * font, and a font save writes it back. `glyphView.guides` is the
   * primary working copy because guides are pure UI state during a
   * session, but the persisted home is on the Font.
   */
  guides: GuideSettings;
};

type AppState = {
  font: Font;
  /**
   * Active style settings. Always a complete `StyleSettings`. Used by
   * every renderer (StyleSetter preview, TypeSetter, GlyphSetter fill
   * preview). Independent of `font.style`: changing fonts seeds it from
   * `font.style`, but loading a Style file replaces it without touching
   * the font.
   */
  style: StyleSettings;
  /**
   * Snapshot of `style` at the last load point (font load or Style file
   * load). Drives the per-slider "modified" marker and bulk-reset
   * behaviour: any control whose current value differs from this
   * baseline renders in the universal warn-red.
   */
  loadedStyleSettings: StyleSettings;
  text: string;
  textScale: number;
  module: ModuleId;
  selectedGlyph: string;
  /** Which left-column tab is active in the GlyphSetter. Lifted into the
   *  store so other modules (e.g. StyleSetter) can switch to the kerning
   *  panel programmatically. */
  glyphsetterTab: 'glyphs' | 'kerning' | 'settings';
  /** Optional pair (e.g. "AV") for the KerningList to scroll to and
   *  visually highlight on next render. Single-shot: consumers clear it. */
  kerningFocusPair: string | undefined;
  glyphView: GlyphViewOptions;
  setStyle: (patch: Partial<StyleSettings>) => void;
  /** Alias of `setStyle`. Kept for back-compat with the historical
   *  "overlay" terminology used in StyleSetter call sites. */
  setStyleOverride: (patch: Partial<StyleSettings>) => void;
  /** Revert the active style to whatever was loaded last (font.style on
   *  font load, Style.settings on Style load). */
  clearStyleOverrides: () => void;
  /** Load a Style: replace both the active style and the baseline. */
  loadStyleSettings: (s: StyleSettings) => void;
  setText: (text: string) => void;
  setTextScale: (s: number) => void;
  setModule: (module: ModuleId) => void;
  setGlyphsetterTab: (tab: 'glyphs' | 'kerning' | 'settings') => void;
  setKerningFocusPair: (pair: string | undefined) => void;
  selectGlyph: (char: string) => void;
  setGlyph: (char: string, glyph: Glyph) => void;
  updateSelectedGlyph: (fn: (g: Glyph) => Glyph) => void;
  updateAllGlyphs: (fn: (g: Glyph, char: string) => Glyph) => void;
  setGlyphView: (patch: Partial<GlyphViewOptions>) => void;
  /** Update the per-font guides (writes both store.font.guides and the
   *  glyphView mirror). */
  setFontGuides: (guides: GuideSettings) => void;
  setKerning: (pairs: Record<string, number>) => void;
  /** Swap the active font (and optionally restored view settings).
   *  Seeds `style` and `loadedStyleSettings` from `font.style`. */
  loadFont: (font: Font, view?: GlyphViewOptions) => void;
};

const firstGlyph = Object.keys(defaultFont.glyphs)[0] ?? 'A';

const DEFAULT_TEXT =
  'The quick brown fox\njumps over the lazy dog\n0123456789 !?';

export const useAppStore = create<AppState>((set, get) => ({
  font: defaultFont,
  style: defaultFont.style,
  loadedStyleSettings: defaultFont.style,
  text: DEFAULT_TEXT,
  textScale: 1,
  module: 'glyphsetter',
  selectedGlyph: firstGlyph,
  glyphsetterTab: 'glyphs',
  kerningFocusPair: undefined,
  glyphView: {
    showAnchors: true,
    showFillPreview: true,
    fillOpacity: 0.6,
    strokeOpacity: 1,
    showOtherGlyphs: false,
    showBorders: false,
    showTriangles: false,
    showSpline0: false,
    showSpline1: false,
    refFontFamily: '',
    refFontOpacity: 0.18,
    editorScale: 5,
    panX: 0,
    panY: 0,
    showLineGrid: false,
    guides: (defaultFont.guides as GuideSettings | undefined) ?? defaultGuides(),
  },
  setStyle: (patch) =>
    set((s) => ({ style: { ...s.style, ...patch } })),
  setStyleOverride: (patch) =>
    set((s) => {
      const next: StyleSettings = { ...s.style };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) {
          // Patch with `undefined` means "revert this field to baseline".
          (next as Record<string, unknown>)[k] = (s.loadedStyleSettings as Record<string, unknown>)[k];
        } else {
          (next as Record<string, unknown>)[k] = v;
        }
      }
      return { style: next };
    }),
  clearStyleOverrides: () =>
    set((s) => ({ style: s.loadedStyleSettings })),
  loadStyleSettings: (style) =>
    set({ style, loadedStyleSettings: style }),
  setText: (text) => set({ text }),
  setTextScale: (textScale) => set({ textScale }),
  setModule: (module) => set({ module }),
  setGlyphsetterTab: (glyphsetterTab) => set({ glyphsetterTab }),
  setKerningFocusPair: (kerningFocusPair) => set({ kerningFocusPair }),
  selectGlyph: (char) => set({ selectedGlyph: char }),
  setGlyph: (char, glyph) =>
    set((s) => ({
      font: { ...s.font, glyphs: { ...s.font.glyphs, [char]: glyph } },
    })),
  updateSelectedGlyph: (fn) => {
    const { font, selectedGlyph } = get();
    const g = font.glyphs[selectedGlyph];
    if (!g) return;
    set({
      font: { ...font, glyphs: { ...font.glyphs, [selectedGlyph]: fn(g) } },
    });
  },
  updateAllGlyphs: (fn) => {
    const { font } = get();
    const next: Record<string, Glyph> = {};
    for (const [c, g] of Object.entries(font.glyphs)) next[c] = fn(g, c);
    set({ font: { ...font, glyphs: next } });
  },
  setGlyphView: (patch) =>
    set((s) => ({ glyphView: { ...s.glyphView, ...patch } })),
  setFontGuides: (guides) =>
    set((s) => ({
      font: { ...s.font, guides },
      glyphView: { ...s.glyphView, guides },
    })),
  setKerning: (kerning) =>
    set((s) => ({
      font: {
        ...s.font,
        kerning: Object.keys(kerning).length === 0 ? undefined : kerning,
      },
    })),
  loadFont: (font, view) =>
    set((s) => {
      const f = withCommonGlyphFallback(font);
      const guides = (f.guides as GuideSettings | undefined) ?? view?.guides ?? s.glyphView.guides;
      // editorScale is a session-only preference: never let a loaded
      // font's saved view (or the absence thereof) reset the user's
      // current zoom.
      const keepScale = s.glyphView.editorScale;
      return {
        font: { ...f, guides },
        // A font carries a baseline style for back-compat. Loading a font
        // resets the active style to that baseline; a separate Style
        // file (loaded afterwards) can override.
        style: f.style,
        loadedStyleSettings: f.style,
        glyphView: view
          ? { ...s.glyphView, ...view, guides, editorScale: keepScale }
          : { ...s.glyphView, guides, editorScale: keepScale },
      };
    }),
}));

/**
 * Returns the active style. Kept for back-compat with the old
 * `effectiveStyle(font, overrides)` call sites — the second argument
 * is now the full active `StyleSettings`, which simply wins.
 */
export function effectiveStyle(_font: Font, style: StyleSettings): StyleSettings {
  return style;
}

/** Synthesize a `Font` whose `.style` is the active style. Used to feed
 *  core renderers (`layout`, `renderLayoutToSvg`, …) that still take
 *  a Font. The caller's original `font` is unchanged. */
export function fontWithOverrides(font: Font, style: StyleSettings): Font {
  if (font.style === style) return font;
  return { ...font, style };
}
