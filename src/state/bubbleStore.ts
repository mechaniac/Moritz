/**
 * Zustand store for the BubbleSetter module. Mirrors the shape of the
 * GlyphSetter slice in `state/store.ts` (font + selection + view) but
 * scoped to bubbles. Kept in its own file so the main store doesn't
 * grow further; the BubbleSetter module is the only consumer.
 */

import { create } from 'zustand';
import { defaultBubbleFont } from '../data/defaultBubbleFont.js';
import type { Bubble, BubbleFont, BubbleLayer } from '../core/types.js';

export type BubbleViewOptions = {
  showAnchors: boolean;
  showFillPreview: boolean;
  showGrid: boolean;
  /** Pixels-per-bubble-unit zoom in the editor canvas. */
  editorScale: number;
  /** Pan offset in screen pixels. (0,0) = artwork centred. */
  panX: number;
  panY: number;
  /** Opacity multiplier for centerline fill (0-1, default 1). */
  fillOpacity: number;
  /** Opacity multiplier for ink stroke (0-1, default 1). */
  strokeOpacity: number;
};

type BubbleState = {
  font: BubbleFont;
  selectedBubble: string;
  selectedLayer: string | null;
  view: BubbleViewOptions;

  loadBubbleFont: (font: BubbleFont, view?: Partial<BubbleViewOptions>) => void;
  selectBubble: (id: string) => void;
  selectLayer: (id: string | null) => void;
  setView: (patch: Partial<BubbleViewOptions>) => void;

  updateSelectedBubble: (fn: (b: Bubble) => Bubble) => void;
  updateLayer: (
    bubbleId: string,
    layerId: string,
    fn: (l: BubbleLayer) => BubbleLayer,
  ) => void;
  addLayer: (bubbleId: string, layer: BubbleLayer) => void;
  removeLayer: (bubbleId: string, layerId: string) => void;
};

const firstBubbleId = Object.keys(defaultBubbleFont.bubbles)[0] ?? '';

export const useBubbleStore = create<BubbleState>((set) => ({
  font: defaultBubbleFont,
  selectedBubble: firstBubbleId,
  selectedLayer:
    defaultBubbleFont.bubbles[firstBubbleId]?.layers[0]?.id ?? null,
  view: {
    showAnchors: true,
    showFillPreview: true,
    showGrid: true,
    editorScale: 1.4,
    panX: 0,
    panY: 0,
    fillOpacity: 1,
    strokeOpacity: 1,
  },

  loadBubbleFont: (font, view) => {
    const id = Object.keys(font.bubbles)[0] ?? '';
    set((s) => ({
      font,
      selectedBubble: id,
      selectedLayer: font.bubbles[id]?.layers[0]?.id ?? null,
      view: view ? { ...s.view, ...view } : s.view,
    }));
  },
  selectBubble: (selectedBubble) =>
    set((s) => ({
      selectedBubble,
      selectedLayer: s.font.bubbles[selectedBubble]?.layers[0]?.id ?? null,
    })),
  selectLayer: (selectedLayer) => set({ selectedLayer }),
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

  updateSelectedBubble: (fn) =>
    set((s) => {
      const b = s.font.bubbles[s.selectedBubble];
      if (!b) return {};
      return {
        font: {
          ...s.font,
          bubbles: { ...s.font.bubbles, [s.selectedBubble]: fn(b) },
        },
      };
    }),
  updateLayer: (bubbleId, layerId, fn) =>
    set((s) => {
      const b = s.font.bubbles[bubbleId];
      if (!b) return {};
      const next: Bubble = {
        ...b,
        layers: b.layers.map((l) => (l.id === layerId ? fn(l) : l)),
      };
      return {
        font: { ...s.font, bubbles: { ...s.font.bubbles, [bubbleId]: next } },
      };
    }),
  addLayer: (bubbleId, layer) =>
    set((s) => {
      const b = s.font.bubbles[bubbleId];
      if (!b) return {};
      const next: Bubble = { ...b, layers: [...b.layers, layer] };
      return {
        font: { ...s.font, bubbles: { ...s.font.bubbles, [bubbleId]: next } },
        selectedLayer: layer.id,
      };
    }),
  removeLayer: (bubbleId, layerId) =>
    set((s) => {
      const b = s.font.bubbles[bubbleId];
      if (!b) return {};
      const next: Bubble = {
        ...b,
        layers: b.layers.filter((l) => l.id !== layerId),
      };
      return {
        font: { ...s.font, bubbles: { ...s.font.bubbles, [bubbleId]: next } },
        selectedLayer:
          s.selectedLayer === layerId ? (next.layers[0]?.id ?? null) : s.selectedLayer,
      };
    }),
}));
