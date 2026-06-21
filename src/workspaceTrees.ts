import type { cObject } from '@christof/sigrid/core';
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

function moritzFontTree(): cObject {
  return moritzFontCObject(useAppStore.getState().font);
}

function moritzBubbleTree(): cObject {
  return moritzBubbleFontCObject(useBubbleStore.getState().font);
}

function moritzTypeSetterTree(): cObject {
  return moritzTypeSetterPageCObject(typeSetterInput());
}
