import { cNodeById, createCObject, type cObject } from '@christof/sigrid/core';
import type {
  Block,
  BlockBubble,
  Bubble,
  BubbleFont,
  BubbleLayer,
  Font,
  Glyph,
  Stroke,
} from './types.js';

export type GlyphObjectSelection =
  | { kind: 'none' }
  | { kind: 'animator' }
  | { kind: 'stroke'; strokeIdx: number }
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'multi'; strokeIdxs: readonly number[] };

export type MoritzCObjectRole =
  | 'page'
  | 'block'
  | 'text'
  | 'blockBubble'
  | 'bubbleFont'
  | 'bubble'
  | 'bubbleLayer'
  | 'font'
  | 'glyph'
  | 'animator'
  | 'stroke'
  | 'anchor'
  | 'handle'
  | 'multi';

export type MoritzCObjectMeta = {
  readonly id: string;
  readonly role: MoritzCObjectRole;
  readonly label: string;
  readonly fontId?: string;
  readonly glyphChar?: string;
  readonly pageId?: string;
  readonly blockId?: string;
  readonly textId?: string;
  readonly bubbleFontId?: string;
  readonly bubbleId?: string;
  readonly layerId?: string;
  readonly strokeIdx?: number;
  readonly vIdx?: number;
  readonly handleSide?: 'in' | 'out';
  readonly selectedIds?: readonly string[];
};

export type MoritzGlyphCObjectSelection = {
  readonly root: cObject | null;
  readonly selected: cObject | null;
  readonly selectedObjects: readonly cObject[];
  readonly selectedIds: readonly string[];
  readonly meta: MoritzCObjectMeta | null;
};

export type MoritzBubbleCObjectSelection = MoritzGlyphCObjectSelection;
export type MoritzTypeSetterCObjectSelection = MoritzGlyphCObjectSelection;

export type BubbleObjectSelection =
  | { kind: 'bubble' }
  | { kind: 'layer'; layerId: string };

export type TypeSetterObjectSelection =
  | { kind: 'page' }
  | { kind: 'block'; blockId: string }
  | { kind: 'text'; blockId: string }
  | { kind: 'bubble'; blockId: string }
  | { kind: 'bubbleLayer'; blockId: string; layerId: string };

export type TypeSetterCObjectInput = {
  readonly pageId: string;
  readonly pageName: string;
  readonly blocks: readonly Block[];
  readonly bubbleFont?: BubbleFont;
};

export function moritzGlyphCObjectSelection(
  font: Font,
  selectedChar: string,
  selection: GlyphObjectSelection,
): MoritzGlyphCObjectSelection {
  const glyph = font.glyphs[selectedChar];
  if (!glyph) {
    return {
      root: null,
      selected: null,
      selectedObjects: [],
      selectedIds: [],
      meta: null,
    };
  }

  const selectedIds = selectedIdsForGlyphSelection(font, selectedChar, glyph, selection);
  const root = moritzFontCObject(font);
  const selectedIdSet = new Set(selectedIds);
  return {
    root,
    selected: selectedCObject(root, selectedIdSet),
    selectedObjects: selectedCObjects(root, selectedIdSet),
    selectedIds,
    meta: metaForGlyphSelection(font, selectedChar, glyph, selection, selectedIds),
  };
}

export function moritzFontCObject(font: Font): cObject {
  return groupObject(
    moritzFontCObjectId(font.id),
    Object.keys(font.glyphs).map((char) => glyphToCObject(font.id, font.glyphs[char]!)),
    {
      role: 'font',
      label: font.name || font.id,
      componentKind: 'moritz.font',
      data: { fontId: font.id },
    },
  );
}

export function moritzBubbleFontCObject(font: BubbleFont): cObject {
  return groupObject(
    moritzBubbleFontCObjectId(font.id),
    Object.values(font.bubbles).map((bubble) => bubbleToCObject(font.id, bubble)),
    {
      role: 'bubbleFont',
      label: font.name || font.id,
      componentKind: 'moritz.bubbleFont',
      data: { bubbleFontId: font.id },
    },
  );
}

export function moritzBubbleCObjectSelection(
  font: BubbleFont,
  selectedBubbleId: string,
  selectedLayerId: string | null,
): MoritzBubbleCObjectSelection {
  const selectedIds = selectedIdsForBubbleSelection(font, selectedBubbleId, selectedLayerId);
  const root = moritzBubbleFontCObject(font);
  const selectedIdSet = new Set(selectedIds);
  const selected = selectedCObject(root, selectedIdSet);
  return {
    root,
    selected,
    selectedObjects: selectedCObjects(root, selectedIdSet),
    selectedIds,
    meta: selected
      ? moritzBubbleCObjectMetaFromId(font, selectedBubbleId, selected.cId)
      : null,
  };
}

export function moritzTypeSetterPageCObject(input: TypeSetterCObjectInput): cObject {
  return groupObject(
    moritzPageCObjectId(input.pageId),
    input.blocks.map((block) => typeSetterBlockToCObject(input, block)),
    {
      role: 'page',
      label: input.pageName,
      componentKind: 'moritz.page',
      data: { pageId: input.pageId },
    },
  );
}

export function moritzTypeSetterPageCObjectSelection(
  input: TypeSetterCObjectInput,
  selection: { readonly blockId?: string | null; readonly layerId?: string | null },
): MoritzTypeSetterCObjectSelection {
  const selectedIds = selectedIdsForTypeSetterSelection(input, selection);
  const root = moritzTypeSetterPageCObject(input);
  const selectedIdSet = new Set(selectedIds);
  const selected = selectedCObject(root, selectedIdSet);
  return {
    root,
    selected,
    selectedObjects: selectedCObjects(root, selectedIdSet),
    selectedIds,
    meta: selected
      ? moritzTypeSetterCObjectMetaFromId(input, selected.cId)
      : null,
  };
}

export function moritzGlyphObjectSelectionFromCObjectId(
  font: Font,
  selectedChar: string,
  id: string,
): GlyphObjectSelection {
  const meta = moritzGlyphCObjectMetaFromId(font, selectedChar, id);
  if (!meta) return { kind: 'none' };
  if (meta.role === 'animator') return { kind: 'animator' };
  if (meta.role === 'stroke' && meta.strokeIdx !== undefined) {
    return { kind: 'stroke', strokeIdx: meta.strokeIdx };
  }
  if (
    (meta.role === 'anchor' || meta.role === 'handle') &&
    meta.strokeIdx !== undefined &&
    meta.vIdx !== undefined
  ) {
    return { kind: 'anchor', strokeIdx: meta.strokeIdx, vIdx: meta.vIdx };
  }
  return { kind: 'none' };
}

export function moritzBubbleObjectSelectionFromCObjectId(
  font: BubbleFont,
  selectedBubbleId: string,
  id: string,
): BubbleObjectSelection {
  const meta = moritzBubbleCObjectMetaFromId(font, selectedBubbleId, id);
  if (meta?.layerId) return { kind: 'layer', layerId: meta.layerId };
  return { kind: 'bubble' };
}

export function moritzTypeSetterObjectSelectionFromCObjectId(
  input: TypeSetterCObjectInput,
  id: string,
): TypeSetterObjectSelection {
  const meta = moritzTypeSetterCObjectMetaFromId(input, id);
  if (meta?.role === 'bubbleLayer' && meta.blockId && meta.layerId) {
    return { kind: 'bubbleLayer', blockId: meta.blockId, layerId: meta.layerId };
  }
  if ((meta?.role === 'glyph' || meta?.role === 'stroke' || meta?.role === 'anchor' || meta?.role === 'handle') && meta.blockId && meta.layerId) {
    return { kind: 'bubbleLayer', blockId: meta.blockId, layerId: meta.layerId };
  }
  if (meta?.role === 'blockBubble' && meta.blockId) {
    return { kind: 'bubble', blockId: meta.blockId };
  }
  if (meta?.role === 'text' && meta.blockId) {
    return { kind: 'text', blockId: meta.blockId };
  }
  if (meta?.blockId) {
    return { kind: 'block', blockId: meta.blockId };
  }
  return { kind: 'page' };
}

export function moritzGlyphCObjectMetaFromId(
  font: Font,
  selectedChar: string,
  id: string,
): MoritzCObjectMeta | null {
  const glyph = font.glyphs[selectedChar];
  if (!glyph) return null;
  if (id === moritzFontCObjectId(font.id)) {
    return {
      id,
      role: 'font',
      label: font.name || font.id,
      fontId: font.id,
    };
  }
  if (id === moritzGlyphCObjectId(font.id, selectedChar)) {
    return {
      id,
      role: 'glyph',
      label: `Glyph ${labelForChar(selectedChar)}`,
      fontId: font.id,
      glyphChar: selectedChar,
    };
  }
  if (glyph.animator && id === moritzGlyphAnimatorCObjectId(font.id, selectedChar)) {
    return {
      id,
      role: 'animator',
      label: 'Animator',
      fontId: font.id,
      glyphChar: selectedChar,
    };
  }
  for (let strokeIdx = 0; strokeIdx < glyph.strokes.length; strokeIdx++) {
    const stroke = glyph.strokes[strokeIdx]!;
    if (id === moritzStrokeCObjectId(font.id, selectedChar, strokeIdx)) {
      return {
        id,
        role: 'stroke',
        label: `Stroke ${strokeIdx + 1}`,
        fontId: font.id,
        glyphChar: selectedChar,
        strokeIdx,
      };
    }
    for (let vIdx = 0; vIdx < stroke.vertices.length; vIdx++) {
      if (id === moritzAnchorCObjectId(font.id, selectedChar, strokeIdx, vIdx)) {
        return {
          id,
          role: 'anchor',
          label: `Anchor ${strokeIdx + 1}.${vIdx + 1}`,
          fontId: font.id,
          glyphChar: selectedChar,
          strokeIdx,
          vIdx,
        };
      }
      for (const side of ['in', 'out'] as const) {
        if (id === moritzHandleCObjectId(font.id, selectedChar, strokeIdx, vIdx, side)) {
          return {
            id,
            role: 'handle',
            label: `${side === 'in' ? 'In' : 'Out'} handle ${strokeIdx + 1}.${vIdx + 1}`,
            fontId: font.id,
            glyphChar: selectedChar,
            strokeIdx,
            vIdx,
            handleSide: side,
          };
        }
      }
    }
  }
  return null;
}

export function moritzBubbleCObjectMetaFromId(
  font: BubbleFont,
  selectedBubbleId: string,
  id: string,
): MoritzCObjectMeta | null {
  if (id === moritzBubbleFontCObjectId(font.id)) {
    return {
      id,
      role: 'bubbleFont',
      label: font.name || font.id,
      bubbleFontId: font.id,
    };
  }
  for (const bubble of Object.values(font.bubbles)) {
    if (id === moritzBubbleCObjectId(font.id, bubble.id)) {
      return {
        id,
        role: 'bubble',
        label: bubble.name || bubble.id,
        bubbleFontId: font.id,
        bubbleId: bubble.id,
      };
    }
    const layerMeta = bubbleLayerMetaFromId({
      id,
      glyphBaseIdForLayer: (layerId) => moritzBubbleLayerGlyphCObjectId(font.id, bubble.id, layerId),
      layerIdForLayer: (layerId) => moritzBubbleLayerCObjectId(font.id, bubble.id, layerId),
      bubble,
      bubbleFontId: font.id,
      bubbleId: bubble.id,
      activeBubbleId: selectedBubbleId,
    });
    if (layerMeta) return layerMeta;
  }
  return null;
}

export function moritzTypeSetterCObjectMetaFromId(
  input: TypeSetterCObjectInput,
  id: string,
): MoritzCObjectMeta | null {
  if (id === moritzPageCObjectId(input.pageId)) {
    return {
      id,
      role: 'page',
      label: input.pageName,
      pageId: input.pageId,
    };
  }
  for (const block of input.blocks) {
    if (id === moritzPageBlockCObjectId(input.pageId, block.id)) {
      return {
        id,
        role: 'block',
        label: blockLabel(block),
        pageId: input.pageId,
        blockId: block.id,
      };
    }
    for (const text of block.texts) {
      if (id === moritzPageBlockTextCObjectId(input.pageId, block.id, text.id)) {
        return {
          id,
          role: 'text',
          label: textLabel(text.text),
          pageId: input.pageId,
          blockId: block.id,
          textId: text.id,
        };
      }
    }
    if (id === moritzPageBlockBubbleCObjectId(input.pageId, block.id)) {
      return {
        id,
        role: 'blockBubble',
        label: blockBubbleLabel(block, input.bubbleFont),
        pageId: input.pageId,
        blockId: block.id,
        bubbleId: blockBubbleId(block.bubble),
      };
    }
    const bubble = resolveBlockBubble(block.bubble, input.bubbleFont);
    if (!bubble) continue;
    const layerMeta = bubbleLayerMetaFromId({
      id,
      glyphBaseIdForLayer: (layerId) =>
        moritzPageBlockBubbleLayerGlyphCObjectId(input.pageId, block.id, layerId),
      layerIdForLayer: (layerId) =>
        moritzPageBlockBubbleLayerCObjectId(input.pageId, block.id, layerId),
      bubble,
      pageId: input.pageId,
      blockId: block.id,
      bubbleId: bubble.id,
    });
    if (layerMeta) return layerMeta;
  }
  return null;
}

export function moritzFontCObjectId(fontId: string): string {
  return `moritz.font.${encodeIdPart(fontId)}`;
}

export function moritzBubbleFontCObjectId(fontId: string): string {
  return `moritz.bubbleFont.${encodeIdPart(fontId)}`;
}

export function moritzBubbleCObjectId(fontId: string, bubbleId: string): string {
  return `${moritzBubbleFontCObjectId(fontId)}.bubble.${encodeIdPart(bubbleId)}`;
}

export function moritzBubbleLayerCObjectId(fontId: string, bubbleId: string, layerId: string): string {
  return `${moritzBubbleCObjectId(fontId, bubbleId)}.layer.${encodeIdPart(layerId)}`;
}

export function moritzBubbleLayerGlyphCObjectId(fontId: string, bubbleId: string, layerId: string): string {
  return `${moritzBubbleLayerCObjectId(fontId, bubbleId, layerId)}.glyph`;
}

export function moritzPageCObjectId(pageId: string): string {
  return `moritz.page.${encodeIdPart(pageId)}`;
}

export function moritzPageBlockCObjectId(pageId: string, blockId: string): string {
  return `${moritzPageCObjectId(pageId)}.block.${encodeIdPart(blockId)}`;
}

export function moritzPageBlockTextCObjectId(
  pageId: string,
  blockId: string,
  textId = 'primary',
): string {
  return `${moritzPageBlockCObjectId(pageId, blockId)}.text.${encodeIdPart(textId)}`;
}

export function moritzPageBlockBubbleCObjectId(pageId: string, blockId: string): string {
  return `${moritzPageBlockCObjectId(pageId, blockId)}.bubble`;
}

export function moritzPageBlockBubbleLayerCObjectId(pageId: string, blockId: string, layerId: string): string {
  return `${moritzPageBlockBubbleCObjectId(pageId, blockId)}.layer.${encodeIdPart(layerId)}`;
}

export function moritzPageBlockBubbleLayerGlyphCObjectId(pageId: string, blockId: string, layerId: string): string {
  return `${moritzPageBlockBubbleLayerCObjectId(pageId, blockId, layerId)}.glyph`;
}

export function moritzGlyphCObjectId(fontId: string, char: string): string {
  return `${moritzFontCObjectId(fontId)}.glyph.${encodeIdPart(char)}`;
}

export function moritzGlyphAnimatorCObjectId(fontId: string, char: string): string {
  return glyphAnimatorCObjectIdForBase(moritzGlyphCObjectId(fontId, char));
}

export function moritzStrokeCObjectId(fontId: string, char: string, strokeIdx: number): string {
  return strokeCObjectIdForBase(moritzGlyphCObjectId(fontId, char), strokeIdx);
}

export function moritzAnchorCObjectId(
  fontId: string,
  char: string,
  strokeIdx: number,
  vIdx: number,
): string {
  return anchorCObjectIdForBase(moritzGlyphCObjectId(fontId, char), strokeIdx, vIdx);
}

export function moritzHandleCObjectId(
  fontId: string,
  char: string,
  strokeIdx: number,
  vIdx: number,
  side: 'in' | 'out',
): string {
  return handleCObjectIdForBase(moritzGlyphCObjectId(fontId, char), strokeIdx, vIdx, side);
}

function glyphToCObject(fontId: string, glyph: Glyph): cObject {
  return glyphToCObjectAtBase(moritzGlyphCObjectId(fontId, glyph.char), glyph, {
    label: `Glyph ${labelForChar(glyph.char)}`,
    data: { fontId, char: glyph.char },
  });
}

function bubbleToCObject(fontId: string, bubble: Bubble): cObject {
  return groupObject(
    moritzBubbleCObjectId(fontId, bubble.id),
    bubble.layers.map((layer) => bubbleLayerToCObject(fontId, bubble.id, layer)),
    {
      role: 'bubble',
      label: bubble.name || bubble.id,
      componentKind: 'moritz.bubble',
      data: { bubbleFontId: fontId, bubbleId: bubble.id },
    },
  );
}

function bubbleLayerToCObject(fontId: string, bubbleId: string, layer: BubbleLayer): cObject {
  return groupObject(
    moritzBubbleLayerCObjectId(fontId, bubbleId, layer.id),
    [
      glyphToCObjectAtBase(moritzBubbleLayerGlyphCObjectId(fontId, bubbleId, layer.id), layer.glyph, {
        label: `Glyph ${layer.name || layer.id}`,
        data: { bubbleFontId: fontId, bubbleId, layerId: layer.id },
      }),
    ],
    {
      role: 'bubbleLayer',
      label: layer.name || layer.id,
      componentKind: 'moritz.bubbleLayer',
      data: { bubbleFontId: fontId, bubbleId, layerId: layer.id },
    },
  );
}

function typeSetterBlockToCObject(input: TypeSetterCObjectInput, block: Block): cObject {
  const children: cObject[] = block.texts.map((text) =>
    groupObject(
      moritzPageBlockTextCObjectId(input.pageId, block.id, text.id),
      [],
      {
        role: 'text',
        label: textLabel(text.text),
        componentKind: 'moritz.text',
        data: { pageId: input.pageId, blockId: block.id, textId: text.id },
      },
    ),
  );
  if (block.bubble) {
    const bubble = resolveBlockBubble(block.bubble, input.bubbleFont);
    children.push(
      groupObject(
        moritzPageBlockBubbleCObjectId(input.pageId, block.id),
        bubble
          ? bubble.layers.map((layer) => typeSetterBubbleLayerToCObject(input.pageId, block.id, layer))
          : [],
        {
          role: 'blockBubble',
          label: blockBubbleLabel(block, input.bubbleFont),
          componentKind: 'moritz.blockBubble',
          data: {
            pageId: input.pageId,
            blockId: block.id,
            bubbleId: blockBubbleId(block.bubble),
          },
        },
      ),
    );
  }
  return groupObject(
    moritzPageBlockCObjectId(input.pageId, block.id),
    children,
    {
      role: 'block',
      label: blockLabel(block),
      componentKind: 'moritz.block',
      data: { pageId: input.pageId, blockId: block.id },
    },
  );
}

function typeSetterBubbleLayerToCObject(pageId: string, blockId: string, layer: BubbleLayer): cObject {
  return groupObject(
    moritzPageBlockBubbleLayerCObjectId(pageId, blockId, layer.id),
    [
      glyphToCObjectAtBase(moritzPageBlockBubbleLayerGlyphCObjectId(pageId, blockId, layer.id), layer.glyph, {
        label: `Glyph ${layer.name || layer.id}`,
        data: { pageId, blockId, layerId: layer.id },
      }),
    ],
    {
      role: 'bubbleLayer',
      label: layer.name || layer.id,
      componentKind: 'moritz.bubbleLayer',
      data: { pageId, blockId, layerId: layer.id },
    },
  );
}

function glyphToCObjectAtBase(
  baseId: string,
  glyph: Glyph,
  input: {
    readonly label: string;
    readonly data: Readonly<Record<string, unknown>>;
  },
): cObject {
  return groupObject(
    baseId,
    [
      ...(glyph.animator
        ? [
            groupObject(
              glyphAnimatorCObjectIdForBase(baseId),
              [],
              {
                role: 'animator',
                label: 'Animator',
                componentKind: 'moritz.animator',
                data: input.data,
              },
            ),
          ]
        : []),
      ...glyph.strokes.map((stroke, strokeIdx) => strokeToCObject(baseId, stroke, strokeIdx)),
    ],
    {
      role: 'glyph',
      label: input.label,
      componentKind: 'moritz.glyph',
      data: input.data,
    },
  );
}

function strokeToCObject(baseId: string, stroke: Stroke, strokeIdx: number): cObject {
  return groupObject(
    strokeCObjectIdForBase(baseId, strokeIdx),
    stroke.vertices.map((_, vIdx) => anchorToCObject(baseId, strokeIdx, vIdx)),
    {
      role: 'stroke',
      label: `Stroke ${strokeIdx + 1}`,
      componentKind: 'moritz.stroke',
      data: { strokeIdx },
    },
  );
}

function anchorToCObject(baseId: string, strokeIdx: number, vIdx: number): cObject {
  return groupObject(
    anchorCObjectIdForBase(baseId, strokeIdx, vIdx),
    [
      groupObject(
        handleCObjectIdForBase(baseId, strokeIdx, vIdx, 'in'),
        [],
        {
          role: 'handle',
          label: `In handle ${strokeIdx + 1}.${vIdx + 1}`,
          componentKind: 'moritz.handle',
          data: { strokeIdx, vIdx, side: 'in' },
        },
      ),
      groupObject(
        handleCObjectIdForBase(baseId, strokeIdx, vIdx, 'out'),
        [],
        {
          role: 'handle',
          label: `Out handle ${strokeIdx + 1}.${vIdx + 1}`,
          componentKind: 'moritz.handle',
          data: { strokeIdx, vIdx, side: 'out' },
        },
      ),
    ],
    {
      role: 'anchor',
      label: `Anchor ${strokeIdx + 1}.${vIdx + 1}`,
      componentKind: 'moritz.anchor',
      data: { strokeIdx, vIdx },
    },
  );
}

function glyphAnimatorCObjectIdForBase(baseId: string): string {
  return `${baseId}.animator`;
}

function strokeCObjectIdForBase(baseId: string, strokeIdx: number): string {
  return `${baseId}.stroke.${strokeIdx}`;
}

function anchorCObjectIdForBase(baseId: string, strokeIdx: number, vIdx: number): string {
  return `${strokeCObjectIdForBase(baseId, strokeIdx)}.anchor.${vIdx}`;
}

function handleCObjectIdForBase(baseId: string, strokeIdx: number, vIdx: number, side: 'in' | 'out'): string {
  return `${anchorCObjectIdForBase(baseId, strokeIdx, vIdx)}.handle.${side}`;
}

function groupObject(
  id: string,
  children: readonly cObject[] = [],
  input?: {
    readonly role?: MoritzCObjectRole;
    readonly label?: string;
    readonly componentKind?: string;
    readonly data?: unknown;
  },
): cObject {
  const role = input?.role ?? 'multi';
  return createCObject({
    cId: id,
    kind: `cnode.moritz.${role}`,
    tags: ['moritz', `moritz.${role}`],
    components: input?.componentKind
      ? [{ kind: input.componentKind, data: input.data ?? {} }]
      : [],
    children,
    extras: {
      displayName: input?.label ?? cObjectFallbackLabel(id),
    },
  });
}

function selectedCObject(root: cObject, selectedIds: ReadonlySet<string>): cObject | null {
  for (const id of selectedIds) {
    const selected = cNodeById(root, id);
    if (selected) return selected;
  }
  return null;
}

function selectedCObjects(root: cObject, selectedIds: ReadonlySet<string>): cObject[] {
  const out: cObject[] = [];
  const visit = (node: cObject): void => {
    if (selectedIds.has(node.cId)) out.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

function cObjectFallbackLabel(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1] || id;
}

function selectedIdsForGlyphSelection(
  font: Font,
  selectedChar: string,
  glyph: Glyph,
  selection: GlyphObjectSelection,
): readonly string[] {
  if (selection.kind === 'animator') {
    return glyph.animator
      ? [moritzGlyphAnimatorCObjectId(font.id, selectedChar)]
      : [moritzGlyphCObjectId(font.id, selectedChar)];
  }
  if (selection.kind === 'stroke') {
    return glyph.strokes[selection.strokeIdx]
      ? [moritzStrokeCObjectId(font.id, selectedChar, selection.strokeIdx)]
      : [moritzGlyphCObjectId(font.id, selectedChar)];
  }
  if (selection.kind === 'anchor') {
    return glyph.strokes[selection.strokeIdx]?.vertices[selection.vIdx]
      ? [moritzAnchorCObjectId(font.id, selectedChar, selection.strokeIdx, selection.vIdx)]
      : [moritzGlyphCObjectId(font.id, selectedChar)];
  }
  if (selection.kind === 'multi') {
    const ids = selection.strokeIdxs
      .filter((strokeIdx) => glyph.strokes[strokeIdx] !== undefined)
      .map((strokeIdx) => moritzStrokeCObjectId(font.id, selectedChar, strokeIdx));
    return ids.length > 0 ? ids : [moritzGlyphCObjectId(font.id, selectedChar)];
  }
  return [moritzGlyphCObjectId(font.id, selectedChar)];
}

function selectedIdsForBubbleSelection(
  font: BubbleFont,
  selectedBubbleId: string,
  selectedLayerId: string | null,
): readonly string[] {
  const bubble = font.bubbles[selectedBubbleId];
  if (!bubble) return [moritzBubbleFontCObjectId(font.id)];
  if (selectedLayerId && bubble.layers.some((layer) => layer.id === selectedLayerId)) {
    return [moritzBubbleLayerCObjectId(font.id, selectedBubbleId, selectedLayerId)];
  }
  return [moritzBubbleCObjectId(font.id, selectedBubbleId)];
}

function selectedIdsForTypeSetterSelection(
  input: TypeSetterCObjectInput,
  selection: { readonly blockId?: string | null; readonly layerId?: string | null },
): readonly string[] {
  const blockId = selection.blockId ?? null;
  if (!blockId) return [moritzPageCObjectId(input.pageId)];
  const block = input.blocks.find((candidate) => candidate.id === blockId);
  if (!block) return [moritzPageCObjectId(input.pageId)];
  const bubble = resolveBlockBubble(block.bubble, input.bubbleFont);
  if (
    selection.layerId &&
    bubble?.layers.some((layer) => layer.id === selection.layerId)
  ) {
    return [moritzPageBlockBubbleLayerCObjectId(input.pageId, blockId, selection.layerId)];
  }
  return [moritzPageBlockCObjectId(input.pageId, blockId)];
}

function bubbleLayerMetaFromId(args: {
  readonly id: string;
  readonly bubble: Bubble;
  readonly glyphBaseIdForLayer: (layerId: string) => string;
  readonly layerIdForLayer: (layerId: string) => string;
  readonly pageId?: string;
  readonly blockId?: string;
  readonly bubbleFontId?: string;
  readonly bubbleId?: string;
  readonly activeBubbleId?: string;
}): MoritzCObjectMeta | null {
  for (const layer of args.bubble.layers) {
    const layerObjectId = args.layerIdForLayer(layer.id);
    const glyphBaseId = args.glyphBaseIdForLayer(layer.id);
    const common = {
      pageId: args.pageId,
      blockId: args.blockId,
      bubbleFontId: args.bubbleFontId,
      bubbleId: args.bubbleId,
      layerId: layer.id,
    };
    if (args.id === layerObjectId) {
      return {
        id: args.id,
        role: 'bubbleLayer',
        label: layer.name || layer.id,
        ...common,
      };
    }
    if (args.id === glyphBaseId) {
      return {
        id: args.id,
        role: 'glyph',
        label: `Glyph ${layer.name || layer.id}`,
        ...common,
      };
    }
    if (layer.glyph.animator && args.id === glyphAnimatorCObjectIdForBase(glyphBaseId)) {
      return {
        id: args.id,
        role: 'animator',
        label: 'Animator',
        ...common,
      };
    }
    for (let strokeIdx = 0; strokeIdx < layer.glyph.strokes.length; strokeIdx++) {
      const stroke = layer.glyph.strokes[strokeIdx]!;
      if (args.id === strokeCObjectIdForBase(glyphBaseId, strokeIdx)) {
        return {
          id: args.id,
          role: 'stroke',
          label: `Stroke ${strokeIdx + 1}`,
          strokeIdx,
          ...common,
        };
      }
      for (let vIdx = 0; vIdx < stroke.vertices.length; vIdx++) {
        if (args.id === anchorCObjectIdForBase(glyphBaseId, strokeIdx, vIdx)) {
          return {
            id: args.id,
            role: 'anchor',
            label: `Anchor ${strokeIdx + 1}.${vIdx + 1}`,
            strokeIdx,
            vIdx,
            ...common,
          };
        }
        for (const side of ['in', 'out'] as const) {
          if (args.id === handleCObjectIdForBase(glyphBaseId, strokeIdx, vIdx, side)) {
            return {
              id: args.id,
              role: 'handle',
              label: `${side === 'in' ? 'In' : 'Out'} handle ${strokeIdx + 1}.${vIdx + 1}`,
              strokeIdx,
              vIdx,
              handleSide: side,
              ...common,
            };
          }
        }
      }
    }
  }
  return null;
}

function resolveBlockBubble(blockBubble: BlockBubble | undefined, bubbleFont: BubbleFont | undefined): Bubble | null {
  if (!blockBubble) return null;
  if (blockBubble.source.kind === 'preset') {
    return blockBubble.source.override ?? bubbleFont?.bubbles[blockBubble.source.bubbleId] ?? null;
  }
  return null;
}

function blockLabel(block: Block): string {
  const text = textLabel(block.texts[0]?.text ?? '');
  return text === 'Empty text' ? `Block ${block.id}` : text;
}

function textLabel(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 28) : 'Empty text';
}

function blockBubbleLabel(block: Block, bubbleFont: BubbleFont | undefined): string {
  const bubble = resolveBlockBubble(block.bubble, bubbleFont);
  if (bubble) return bubble.name || bubble.id;
  if (!block.bubble) return 'Bubble';
  if (block.bubble.source.kind === 'preset') return `Bubble ${block.bubble.source.bubbleId}`;
  return `${block.bubble.source.shape} bubble`;
}

function blockBubbleId(blockBubble: BlockBubble | undefined): string | undefined {
  return blockBubble?.source.kind === 'preset' ? blockBubble.source.bubbleId : undefined;
}

function metaForGlyphSelection(
  font: Font,
  selectedChar: string,
  glyph: Glyph,
  selection: GlyphObjectSelection,
  selectedIds: readonly string[],
): MoritzCObjectMeta {
  if (selection.kind === 'animator' && glyph.animator) {
    return moritzGlyphCObjectMetaFromId(font, selectedChar, selectedIds[0]!)!;
  }
  if (selection.kind === 'stroke' && glyph.strokes[selection.strokeIdx]) {
    return moritzGlyphCObjectMetaFromId(font, selectedChar, selectedIds[0]!)!;
  }
  if (selection.kind === 'anchor' && glyph.strokes[selection.strokeIdx]?.vertices[selection.vIdx]) {
    return moritzGlyphCObjectMetaFromId(font, selectedChar, selectedIds[0]!)!;
  }
  if (selection.kind === 'multi' && selectedIds.length > 1) {
    return {
      id: selectedIds[0]!,
      role: 'multi',
      label: `${selectedIds.length} strokes`,
      fontId: font.id,
      glyphChar: selectedChar,
      selectedIds,
    };
  }
  return {
    id: moritzGlyphCObjectId(font.id, selectedChar),
    role: 'glyph',
    label: `Glyph ${labelForChar(selectedChar)}`,
    fontId: font.id,
    glyphChar: selectedChar,
  };
}

function labelForChar(char: string): string {
  if (char === ' ') return 'space';
  if (char === '\n') return '\\n';
  if (char === '\t') return '\\t';
  return char;
}

function encodeIdPart(value: string): string {
  return encodeURIComponent(value).replace(/\./g, '%2E');
}
