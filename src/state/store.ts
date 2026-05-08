/**
 * Zustand store. Thin wrapper around the immutable domain — all updates
 * produce a fresh `Font.style` object so memoization downstream stays cheap.
 */

import { create } from 'zustand';
import { defaultFont, withCommonGlyphFallback } from '../data/defaultFont.js';
import type { Font, Glyph, StyleSettings } from '../core/types.js';
import { defaultGuides, type GuideSettings } from '../modules/glyphsetter/guides.js';

export type ModuleId = 'glyphsetter' | 'stylesetter' | 'typesetter';

export type GlyphViewOptions = {
  showAnchors: boolean;
  showFillPreview: boolean;
  fillOpacity: number; // 0..1; opacity of the fill preview
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
  guides: GuideSettings;
};

type AppState = {
  font: Font;
  /**
   * Forward-only style modulation written by StyleSetter. NEVER affects the
   * GlyphSetter (which uses `font.style` directly) — pipeline order is:
   *   glyphsetter → stylesetter → typesetter
   * StyleSetter and TypeSetter render with `effectiveStyle()` below, which
   * is `{ ...font.style, ...styleOverrides }`. Cleared on font load.
   * Not persisted with the font (it's a session-level overlay).
   */
  styleOverrides: Partial<StyleSettings>;
  text: string;
  textScale: number;
  module: ModuleId;
  selectedGlyph: string;
  /** Which left-column tab is active in the GlyphSetter. Lifted into the
   *  store so other modules (e.g. StyleSetter) can switch to the kerning
   *  panel programmatically. */
  glyphsetterTab: 'glyphs' | 'kerning';
  /** Optional pair (e.g. "AV") for the KerningList to scroll to and
   *  visually highlight on next render. Single-shot: consumers clear it. */
  kerningFocusPair: string | undefined;
  glyphView: GlyphViewOptions;
  setStyle: (patch: Partial<StyleSettings>) => void;
  /** Patch the StyleSetter overlay. Pass `undefined` for a key to clear it. */
  setStyleOverride: (patch: Partial<StyleSettings>) => void;
  /** Drop the entire StyleSetter overlay (revert to font.style). */
  clearStyleOverrides: () => void;
  setText: (text: string) => void;
  setTextScale: (s: number) => void;
  setModule: (module: ModuleId) => void;
  setGlyphsetterTab: (tab: 'glyphs' | 'kerning') => void;
  setKerningFocusPair: (pair: string | undefined) => void;
  selectGlyph: (char: string) => void;
  setGlyph: (char: string, glyph: Glyph) => void;
  updateSelectedGlyph: (fn: (g: Glyph) => Glyph) => void;
  updateAllGlyphs: (fn: (g: Glyph, char: string) => Glyph) => void;
  setGlyphView: (patch: Partial<GlyphViewOptions>) => void;
  setKerning: (pairs: Record<string, number>) => void;
  /** Swap the active font (and optionally restored view settings).
   *  Always clears the StyleSetter overlay. */
  loadFont: (font: Font, view?: GlyphViewOptions) => void;
};

const firstGlyph = Object.keys(defaultFont.glyphs)[0] ?? 'A';

const DEFAULT_TEXT =
  'The quick brown fox\njumps over the lazy dog\n0123456789 !?';

export const useAppStore = create<AppState>((set, get) => ({
  font: defaultFont,
  styleOverrides: {},
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
    showOtherGlyphs: false,
    showBorders: false,
    showTriangles: false,
    showSpline0: false,
    showSpline1: false,
    refFontFamily: '',
    refFontOpacity: 0.18,
    editorScale: 5,
    guides: defaultGuides(),
  },
  setStyle: (patch) =>
    set((s) => ({
      font: { ...s.font, style: { ...s.font.style, ...patch } },
    })),
  setStyleOverride: (patch) =>
    set((s) => {
      const next: Partial<StyleSettings> = { ...s.styleOverrides };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (next as Record<string, unknown>)[k];
        else (next as Record<string, unknown>)[k] = v;
      }
      return { styleOverrides: next };
    }),
  clearStyleOverrides: () => set({ styleOverrides: {} }),
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
  setKerning: (kerning) =>
    set((s) => ({
      font: {
        ...s.font,
        kerning: Object.keys(kerning).length === 0 ? undefined : kerning,
      },
    })),
  loadFont: (font, view) =>
    set((s) => ({
      font: withCommonGlyphFallback(font),
      // Loading a different font invalidates the StyleSetter overlay —
      // overrides are tied to the previous font's baseline.
      styleOverrides: {},
      glyphView: view ? { ...s.glyphView, ...view } : s.glyphView,
    })),
}));

/** Apply the StyleSetter overlay onto the font's intrinsic style. Use this
 *  in StyleSetter and TypeSetter; never in GlyphSetter. */
export function effectiveStyle(font: Font, overrides: Partial<StyleSettings>): StyleSettings {
  return { ...font.style, ...overrides };
}

/** Convenience: a font with the StyleSetter overlay merged in. Useful for
 *  passing into pipeline stages (`layout`, `transform`, …) that take a Font. */
export function fontWithOverrides(font: Font, overrides: Partial<StyleSettings>): Font {
  if (Object.keys(overrides).length === 0) return font;
  return { ...font, style: effectiveStyle(font, overrides) };
}
