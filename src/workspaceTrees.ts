import type { cObject } from '@christof/sigrid/core';
import { createCObject } from '@christof/sigrid/core';
import {
  moritzBubbleCObjectSelection,
  moritzBubbleFontCObject,
  moritzBubbleObjectSelectionFromCObjectId,
  moritzFontCObject,
  moritzGlyphCObjectSelection,
  moritzGlyphObjectSelectionFromCObjectId,
  moritzTypeSetterObjectSelectionFromCObjectId,
  moritzTypeSetterPageCObject,
  moritzTypeSetterPageCObjectSelection,
  type TypeSetterCObjectInput,
} from './core/moritzCObjects.js';
import { ACTIVE_PAGE_REFS, legacyBlockToBlock } from './core/page.js';
import { getGlyphSetterSelection, setGlyphSetterSelection } from './modules/glyphsetter/GlyphSetter.js';
import { useBubbleStore } from './state/bubbleStore.js';
import { useAppStore, type ModuleId } from './state/store.js';
import { useTypesetterStore } from './state/typesetterStore.js';

export const moritzViewIds = Object.freeze([
  'glyphsetter',
  'bubblesetter',
  'stylesetter',
  'typesetter',
] as const satisfies readonly ModuleId[]);

export const moritzDocumentIds = Object.freeze({
  glyphsetter: 'moritz.font',
  bubblesetter: 'moritz.bubbleFont',
  stylesetter: 'moritz.stylePreview',
  typesetter: 'moritz.page',
} satisfies Record<ModuleId, string>);

export function moritzDocumentIdForView(viewId: ModuleId): string {
  return moritzDocumentIds[viewId];
}

export function moritzViewForDocumentId(documentId: string | undefined): ModuleId {
  const found = moritzViewIds.find((viewId) => moritzDocumentIds[viewId] === documentId);
  return found ?? 'glyphsetter';
}

export function isMoritzViewId(value: string): value is ModuleId {
  return (moritzViewIds as readonly string[]).includes(value);
}

export function moritzTreeForView(viewId: ModuleId): cObject {
  if (viewId === 'bubblesetter') return moritzBubbleTree();
  if (viewId === 'typesetter') return moritzTypeSetterTree();
  if (viewId === 'stylesetter') return moritzStyleTree();
  return moritzFontTree();
}

export function moritzTreeForModule(moduleId: string): cObject {
  return moritzTreeForView(isMoritzViewId(moduleId) ? moduleId : 'glyphsetter');
}

export function moritzSelectedIdForView(viewId: ModuleId): string | undefined {
  if (viewId === 'bubblesetter') {
    const state = useBubbleStore.getState();
    return moritzBubbleCObjectSelection(
      state.font,
      state.selectedBubble,
      state.selectedLayer,
    ).selected?.cId;
  }
  if (viewId === 'typesetter') {
    const state = useTypesetterStore.getState();
    return moritzTypeSetterPageCObjectSelection(typeSetterInput(), {
      blockId: state.selectedBlockId,
      layerId: state.bubbleEditingLayerId,
    }).selected?.cId;
  }
  const state = useAppStore.getState();
  return moritzGlyphCObjectSelection(
    state.font,
    state.selectedGlyph,
    getGlyphSetterSelection(),
  ).selected?.cId;
}

export function moritzSelectedIdForModule(moduleId: string): string | undefined {
  return moritzSelectedIdForView(isMoritzViewId(moduleId) ? moduleId : 'glyphsetter');
}

export function applyMoritzSelection(viewId: ModuleId, id: string | undefined): void {
  if (!id) return;
  if (viewId === 'glyphsetter' || viewId === 'stylesetter') {
    const state = useAppStore.getState();
    setGlyphSetterSelection(
      moritzGlyphObjectSelectionFromCObjectId(state.font, state.selectedGlyph, id),
    );
    return;
  }
  if (viewId === 'bubblesetter') {
    const state = useBubbleStore.getState();
    const selection = moritzBubbleObjectSelectionFromCObjectId(
      state.font,
      state.selectedBubble,
      id,
    );
    if (selection.kind === 'layer') {
      state.selectLayer(selection.layerId);
    } else {
      state.selectLayer(null);
    }
    return;
  }
  if (viewId === 'typesetter') {
    const selection = moritzTypeSetterObjectSelectionFromCObjectId(typeSetterInput(), id);
    const state = useTypesetterStore.getState();
    if (selection.kind === 'page') {
      state.selectBlock(null);
      state.selectBubbleEditingLayer(null);
      return;
    }
    state.selectBlock(selection.blockId);
    state.selectBubbleEditingLayer(
      selection.kind === 'bubbleLayer' ? selection.layerId : null,
    );
  }
}

export function typeSetterInput(): TypeSetterCObjectInput {
  const typeState = useTypesetterStore.getState();
  return {
    pageId: 'live',
    pageName: 'Page',
    blocks: typeState.blocks.map((block) =>
      legacyBlockToBlock(block, ACTIVE_PAGE_REFS),
    ),
    bubbleFont: useBubbleStore.getState().font,
  };
}

// ---------------------------------------------------------------------------
// Memoized tree builders — return the same cObject reference if the
// underlying store data hasn't changed. This prevents magdalena from
// re-mounting the floating attributes panel on every render.
// ---------------------------------------------------------------------------

let cachedFont: import('./core/types.js').Font | undefined;
let cachedFontTree: cObject | undefined;

function moritzFontTree(): cObject {
  const font = useAppStore.getState().font;
  if (font === cachedFont && cachedFontTree) return cachedFontTree;
  cachedFont = font;
  cachedFontTree = moritzFontCObject(font);
  return cachedFontTree;
}

const STYLE_DOCUMENT_CID = 'moritz.style.root';

let cachedStyle: import('./core/types.js').StyleSettings | undefined;
let cachedStyleTree: cObject | undefined;

export function moritzStyleTree(): cObject {
  const style = useAppStore.getState().style;
  if (style === cachedStyle && cachedStyleTree) return cachedStyleTree;
  cachedStyle = style;
  cachedStyleTree = createCObject({
    cId: STYLE_DOCUMENT_CID,
    kind: 'cnode.moritz.style',
    tags: ['moritz', 'moritz.style'],
    extras: {
      displayName: 'Style',
      style,
    },
  });
  return cachedStyleTree;
}

let cachedBubbleFont: import('./core/types.js').BubbleFont | undefined;
let cachedBubbleTree: cObject | undefined;

function moritzBubbleTree(): cObject {
  const font = useBubbleStore.getState().font;
  if (font === cachedBubbleFont && cachedBubbleTree) return cachedBubbleTree;
  cachedBubbleFont = font;
  cachedBubbleTree = moritzBubbleFontCObject(font);
  return cachedBubbleTree;
}

/** Read StyleSettings from a style document tree. */
export function readStyleFromTree(tree: cObject): import('./core/types.js').StyleSettings | undefined {
  return tree.extras?.['style'] as import('./core/types.js').StyleSettings | undefined;
}

/** Patch StyleSettings on a style document tree and return the new tree. */
export function patchStyleOnTree(tree: cObject, patch: Partial<import('./core/types.js').StyleSettings>): cObject {
  const current = (tree.extras?.['style'] ?? {}) as Record<string, unknown>;
  return createCObject({
    cId: tree.cId,
    kind: tree.kind,
    tags: [...tree.tags],
    extras: {
      ...tree.extras,
      style: { ...current, ...patch },
    },
  });
}

function moritzTypeSetterTree(): cObject {
  return moritzTypeSetterPageCObject(typeSetterInput());
}
