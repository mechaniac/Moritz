/**
 * State for the TypeSetter module.
 *
 * Each TextBlock represents one comic-book lettering placement on top of
 * the loaded page image: position, size, text, and per-block style overrides
 * (font size + bold/italic multipliers, applied later).
 */

import { create } from 'zustand';

export type TextBlockId = string;

export type TextBlock = {
  readonly id: TextBlockId;
  readonly x: number;          // in image pixels
  readonly y: number;
  readonly fontSize: number;   // pixels per glyph height
  readonly text: string;
  readonly bold: number;       // multiplier on stroke width (1 = normal)
  readonly italic: number;     // additional slant in radians
};

type TypesetterState = {
  pageImage: string | null;    // data URL or object URL
  pageW: number;
  pageH: number;
  blocks: readonly TextBlock[];
  selectedBlockId: TextBlockId | null;
  setPage: (dataUrl: string, w: number, h: number) => void;
  addBlock: (b: Omit<TextBlock, 'id'>) => void;
  updateBlock: (id: TextBlockId, patch: Partial<TextBlock>) => void;
  deleteBlock: (id: TextBlockId) => void;
  selectBlock: (id: TextBlockId | null) => void;
};

let counter = 0;
const newId = (): string => `tb_${(++counter).toString(36)}_${Date.now().toString(36)}`;

export const useTypesetterStore = create<TypesetterState>((set) => ({
  pageImage: null,
  pageW: 0,
  pageH: 0,
  blocks: [],
  selectedBlockId: null,
  setPage: (dataUrl, w, h) => set({ pageImage: dataUrl, pageW: w, pageH: h }),
  addBlock: (b) =>
    set((s) => {
      const id = newId();
      return { blocks: [...s.blocks, { ...b, id }], selectedBlockId: id };
    }),
  updateBlock: (id, patch) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),
  deleteBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
    })),
  selectBlock: (id) => set({ selectedBlockId: id }),
}));
