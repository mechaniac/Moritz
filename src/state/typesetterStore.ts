/**
 * State for the TypeSetter module.
 *
 * Each TextBlock represents one comic-book lettering placement on top of
 * the loaded page image: position, size, text, and per-block style overrides
 * (font size + bold/italic multipliers, applied later).
 */

import { create } from 'zustand';
import type { BubbleShape } from '../core/bubble.js';
import type { Bubble, BubbleLayer } from '../core/types.js';

export type TextBlockId = string;

/**
 * A "page format" preset: the page dimensions plus a default safe-area
 * inset (the inner margin that comic / cartoon artists keep clear of
 * trim). The full work area in TypeSetter IS the page — there is no
 * floating "page dummy" on a stage. The safe-area is rendered as a
 * dashed inner rectangle so the user can letter inside it.
 */
export type PageFormat = {
  readonly id: string;
  readonly name: string;
  readonly w: number;
  readonly h: number;
  /** Default `border.inset` for this format (px). */
  readonly inset: number;
};

export const PAGE_FORMATS: readonly PageFormat[] = [
  { id: 'us-comic',      name: 'US Comic Book (6.625×10.187")', w: 663,  h: 1019, inset: 36 },
  { id: 'manga-b5',      name: 'Manga (B5)',                    w: 437,  h: 620,  inset: 24 },
  { id: 'cartoon-strip', name: 'Cartoon Strip (4-panel)',       w: 1200, h: 400,  inset: 20 },
  { id: 'sunday-strip',  name: 'Sunday Strip (landscape)',      w: 1400, h: 900,  inset: 28 },
  { id: 'a4-portrait',   name: 'A4 Portrait',                   w: 595,  h: 842,  inset: 30 },
  { id: 'square',        name: 'Square 1024',                   w: 1024, h: 1024, inset: 32 },
];

export type PageBorder = {
  /** Inset from page edge to safe area, in image pixels. */
  readonly inset: number;
  /** Visual line width of the safe-area guide (image pixels). */
  readonly stroke: number;
};

export type TextBlock = {
  readonly id: TextBlockId;
  readonly x: number;          // in image pixels
  readonly y: number;
  readonly fontSize: number;   // pixels per glyph height
  readonly text: string;
  readonly bold: number;       // multiplier on stroke width (1 = normal)
  readonly italic: number;     // additional slant in radians
  // Bubble (caption / speech / cloud). 'none' = no bubble drawn.
  readonly shape: BubbleShape;
  readonly bubbleW: number;    // bubble bounding box (image px), top-left = (x,y)
  readonly bubbleH: number;
  readonly tailX: number;      // tail tip in bubble-local coords (image px)
  readonly tailY: number;
  readonly bubbleStroke: number; // bubble outline width (image px)
  readonly align?: 'left' | 'center' | 'right'; // text alignment, default 'left'
  /** Per-block font override. When undefined the active global font is
   *  used (legacy behaviour). When set, must match an id in the page
   *  library (built-ins + saved). Round-trips through Page.library. */
  readonly fontId?: string;
  /** Per-block style override. Same resolution model as `fontId`. */
  readonly styleId?: string;
  /** When `shape === 'preset'`, the id of a Bubble inside the active
   *  BubbleFont (see `useBubbleStore`). Resolved at render time so that
   *  switching the active BubbleFont updates every block automatically. */
  readonly bubblePresetId?: string;
  /** Per-block instance snapshot. When set, this overrides the lookup
   *  by `bubblePresetId` — the user has begun editing the bubble for
   *  this block locally. The preset stays untouched until they press
   *  "Save to preset". Cloned from the preset on first edit. */
  readonly bubble?: Bubble;
};

type TypesetterState = {
  pageImage: string | null;    // data URL or object URL
  pageW: number;
  pageH: number;
  pageFormatId: string;        // last-selected format (for the dropdown UI)
  border: PageBorder;
  blocks: readonly TextBlock[];
  selectedBlockId: TextBlockId | null;
  /** When non-null, the TypeSetter centre area shows the bubble editor
   *  (mirror of BubbleSetter) bound to this block's `bubble`. */
  bubbleEditingBlockId: TextBlockId | null;
  /** Per-edit-session selection of the currently-active layer inside
   *  the block's bubble. Mirrors BubbleStore's `selectedLayer`. */
  bubbleEditingLayerId: string | null;
  setPage: (dataUrl: string | null, w: number, h: number) => void;
  setPageFormat: (id: string) => void;
  setBorder: (patch: Partial<PageBorder>) => void;
  addBlock: (b: Omit<TextBlock, 'id'>) => void;
  updateBlock: (id: TextBlockId, patch: Partial<TextBlock>) => void;
  /** Apply a functional update to a block's per-instance `bubble`
   *  snapshot. The caller passes the resolved "current" bubble
   *  (`block.bubble ?? preset`) so this store doesn't need to know
   *  about the active BubbleFont. */
  updateBlockBubble: (id: TextBlockId, current: Bubble, fn: (b: Bubble) => Bubble) => void;
  /** Functional update for one layer inside a block's bubble. Same
   *  caller-resolved-current pattern as `updateBlockBubble`. */
  updateBlockBubbleLayer: (
    id: TextBlockId,
    current: Bubble,
    layerId: string,
    fn: (l: BubbleLayer) => BubbleLayer,
  ) => void;
  /** Replace the per-block bubble outright (used when cloning a preset
   *  in or resetting back to the preset by clearing it). Pass
   *  `undefined` to clear the snapshot. */
  setBlockBubble: (id: TextBlockId, bubble: Bubble | undefined) => void;
  deleteBlock: (id: TextBlockId) => void;
  selectBlock: (id: TextBlockId | null) => void;
  enterBubbleEdit: (id: TextBlockId | null) => void;
  selectBubbleEditingLayer: (layerId: string | null) => void;
  /** Replace the entire blocks array. Used when loading a Page file. */
  replaceBlocks: (blocks: ReadonlyArray<Omit<TextBlock, 'id'> & { id?: TextBlockId }>) => void;
};

let counter = 0;
const newId = (): string => `tb_${(++counter).toString(36)}_${Date.now().toString(36)}`;

const DEFAULT_FORMAT = PAGE_FORMATS[0]!;

export const useTypesetterStore = create<TypesetterState>((set) => ({
  pageImage: null,
  // Default to a US comic page. Lets the user start placing bubbles
  // without first loading a background image.
  pageW: DEFAULT_FORMAT.w,
  pageH: DEFAULT_FORMAT.h,
  pageFormatId: DEFAULT_FORMAT.id,
  border: { inset: DEFAULT_FORMAT.inset, stroke: 1 },
  blocks: [],
  selectedBlockId: null,
  bubbleEditingBlockId: null,
  bubbleEditingLayerId: null,
  setPage: (dataUrl, w, h) =>
    set({ pageImage: dataUrl && dataUrl.length > 0 ? dataUrl : null, pageW: w, pageH: h }),
  setPageFormat: (id) =>
    set((s) => {
      const f = PAGE_FORMATS.find((p) => p.id === id);
      if (!f) return s;
      return {
        pageFormatId: id,
        pageW: f.w,
        pageH: f.h,
        border: { ...s.border, inset: f.inset },
      };
    }),
  setBorder: (patch) => set((s) => ({ border: { ...s.border, ...patch } })),
  addBlock: (b) =>
    set((s) => {
      const id = newId();
      return { blocks: [...s.blocks, { ...b, id }], selectedBlockId: id };
    }),
  updateBlock: (id, patch) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),
  updateBlockBubble: (id, current, fn) =>
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === id ? { ...b, bubble: fn(b.bubble ?? current) } : b,
      ),
    })),
  updateBlockBubbleLayer: (id, current, layerId, fn) =>
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b;
        const base = b.bubble ?? current;
        const next: Bubble = {
          ...base,
          layers: base.layers.map((l) => (l.id === layerId ? fn(l) : l)),
        };
        return { ...b, bubble: next };
      }),
    })),
  setBlockBubble: (id, bubble) =>
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b;
        // Drop the property when clearing so persistence stays compact.
        if (bubble === undefined) {
          const { bubble: _drop, ...rest } = b;
          return rest as TextBlock;
        }
        return { ...b, bubble };
      }),
    })),
  deleteBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
      bubbleEditingBlockId:
        s.bubbleEditingBlockId === id ? null : s.bubbleEditingBlockId,
    })),
  selectBlock: (id) => set({ selectedBlockId: id }),
  enterBubbleEdit: (id) =>
    set((s) => {
      if (id === null) {
        return { bubbleEditingBlockId: null, bubbleEditingLayerId: null };
      }
      const b = s.blocks.find((x) => x.id === id) ?? null;
      const firstLayer = b?.bubble?.layers[0]?.id ?? null;
      return {
        bubbleEditingBlockId: id,
        bubbleEditingLayerId: firstLayer,
      };
    }),
  selectBubbleEditingLayer: (layerId) =>
    set({ bubbleEditingLayerId: layerId }),
  replaceBlocks: (next) =>
    set({
      blocks: next.map((b) => ({ ...(b as TextBlock), id: b.id ?? newId() })),
      selectedBlockId: null,
    }),
}));
