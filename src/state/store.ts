/**
 * Zustand store. Thin wrapper around the immutable domain — all updates
 * produce a fresh `Font.style` object so memoization downstream stays cheap.
 */

import { create } from 'zustand';
import { defaultFont } from '../data/defaultFont.js';
import type { Font, Glyph, StyleSettings } from '../core/types.js';

export type ModuleId = 'glyphsetter' | 'stylesetter' | 'typesetter';

export type TriMode = 'earcut' | 'ribbon-fixed' | 'ribbon-density';

export type GlyphViewOptions = {
  showAnchors: boolean;
  showFillPreview: boolean;
  showBorders: boolean; // colorized debug overlay of left/right/caps
  showTriangles: boolean; // ear-clip triangulation of the outline polygon
  triMode: TriMode;
  ribbonSamples: number; // samples per Bezier segment when triMode='ribbon-fixed'
  ribbonSpacing: number; // target arc-length spacing in glyph units when triMode='ribbon-density'
  ribbonSpread: number; // 0..1: blend interior sample placement from parameter-uniform (0) to arc-length-uniform (1)
};

type AppState = {
  font: Font;
  text: string;
  textScale: number;
  module: ModuleId;
  selectedGlyph: string;
  glyphView: GlyphViewOptions;
  setStyle: (patch: Partial<StyleSettings>) => void;
  setText: (text: string) => void;
  setTextScale: (s: number) => void;
  setModule: (module: ModuleId) => void;
  selectGlyph: (char: string) => void;
  setGlyph: (char: string, glyph: Glyph) => void;
  updateSelectedGlyph: (fn: (g: Glyph) => Glyph) => void;
  setGlyphView: (patch: Partial<GlyphViewOptions>) => void;
};

const firstGlyph = Object.keys(defaultFont.glyphs)[0] ?? 'A';

const DEFAULT_TEXT =
  'The quick brown fox\njumps over the lazy dog\n0123456789 !?';

export const useAppStore = create<AppState>((set, get) => ({
  font: defaultFont,
  text: DEFAULT_TEXT,
  textScale: 1,
  module: 'glyphsetter',
  selectedGlyph: firstGlyph,
  glyphView: {
    showAnchors: true,
    showFillPreview: true,
    showBorders: false,
    showTriangles: false,
    triMode: 'earcut',
    ribbonSamples: 6,
    ribbonSpacing: 4,
    ribbonSpread: 1,
  },
  setStyle: (patch) =>
    set((s) => ({
      font: { ...s.font, style: { ...s.font.style, ...patch } },
    })),
  setText: (text) => set({ text }),
  setTextScale: (textScale) => set({ textScale }),
  setModule: (module) => set({ module }),
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
  setGlyphView: (patch) =>
    set((s) => ({ glyphView: { ...s.glyphView, ...patch } })),
}));
