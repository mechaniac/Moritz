import { describe, expect, it } from 'vitest';
import { defaultFont } from '../../src/data/defaultFont.js';
import { defaultBubbleFont } from '../../src/data/defaultBubbleFont.js';
import {
  moritzAnchorCObjectId,
  moritzBubbleCObjectId,
  moritzBubbleCObjectSelection,
  moritzBubbleFontCObject,
  moritzBubbleLayerCObjectId,
  moritzBubbleLayerGlyphCObjectId,
  moritzBubbleObjectSelectionFromCObjectId,
  moritzFontCObject,
  moritzGlyphAnimatorCObjectId,
  moritzGlyphCObjectId,
  moritzGlyphCObjectSelection,
  moritzGlyphObjectSelectionFromCObjectId,
  moritzHandleCObjectId,
  moritzPageBlockBubbleLayerCObjectId,
  moritzPageBlockCObjectId,
  moritzPageBlockTextCObjectId,
  moritzPageCObjectId,
  moritzStrokeCObjectId,
  moritzTypeSetterObjectSelectionFromCObjectId,
  moritzTypeSetterPageCObject,
  moritzTypeSetterPageCObjectSelection,
} from '../../src/core/moritzCObjects.js';
import type { LegacyTextBlock } from '../../src/core/types.js';

describe('moritzGlyphCObjectSelection', () => {
  it('builds the font as a cObject tree of glyph cObjects', () => {
    const root = moritzFontCObject(defaultFont);
    const first = firstChar();

    expect(root.id).toMatch(/^moritz\.font\./);
    expect(root.children.map((node) => node.id)).toContain(
      moritzGlyphCObjectId(defaultFont.id, first),
    );
  });

  it('selects the glyph cObject when no inner stroke is selected', () => {
    const char = firstChar();
    const result = moritzGlyphCObjectSelection(defaultFont, char, { kind: 'none' });

    expect(result.selected?.id).toBe(moritzGlyphCObjectId(defaultFont.id, char));
    expect(result.meta?.role).toBe('glyph');
    expect(result.selectedObjects.map((node) => node.id)).toEqual([result.selected?.id]);
  });

  it('selects a stroke cObject from the editor stroke selection', () => {
    const char = firstCharWithStroke();
    const result = moritzGlyphCObjectSelection(defaultFont, char, {
      kind: 'stroke',
      strokeIdx: 0,
    });

    expect(result.selected?.id).toBe(moritzStrokeCObjectId(defaultFont.id, char, 0));
    expect(result.meta).toMatchObject({ role: 'stroke', strokeIdx: 0, glyphChar: char });
  });

  it('selects an anchor cObject from the editor anchor selection', () => {
    const char = firstCharWithStroke();
    const result = moritzGlyphCObjectSelection(defaultFont, char, {
      kind: 'anchor',
      strokeIdx: 0,
      vIdx: 0,
    });

    expect(result.selected?.id).toBe(moritzAnchorCObjectId(defaultFont.id, char, 0, 0));
    expect(result.meta).toMatchObject({ role: 'anchor', strokeIdx: 0, vIdx: 0 });
  });

  it('exposes a glyph animator as a child component when present', () => {
    const char = firstCharWithStroke();
    const glyph = defaultFont.glyphs[char]!;
    const font = {
      ...defaultFont,
      glyphs: {
        ...defaultFont.glyphs,
        [char]: {
          ...glyph,
          animator: {
            id: 'runner',
            kind: 'symbol-along-stroke' as const,
            symbols: [{ id: 'dot' }],
          },
        },
      },
    };

    const result = moritzGlyphCObjectSelection(font, char, { kind: 'none' });
    const glyphNode = result.root?.children.find(
      (node) => node.id === moritzGlyphCObjectId(font.id, char),
    );

    expect(glyphNode?.children[0]?.id).toBe(moritzGlyphAnimatorCObjectId(font.id, char));
  });

  it('selects the glyph animator cObject when requested', () => {
    const char = firstCharWithStroke();
    const glyph = defaultFont.glyphs[char]!;
    const font = {
      ...defaultFont,
      glyphs: {
        ...defaultFont.glyphs,
        [char]: {
          ...glyph,
          animator: {
            id: 'runner',
            kind: 'symbol-along-stroke' as const,
            symbols: [{ id: 'dot' }],
          },
        },
      },
    };

    const result = moritzGlyphCObjectSelection(font, char, { kind: 'animator' });

    expect(result.selected?.id).toBe(moritzGlyphAnimatorCObjectId(font.id, char));
    expect(result.meta).toMatchObject({ role: 'animator', glyphChar: char });
  });

  it('maps cObject ids back to glyph-editor selections', () => {
    const char = firstCharWithStroke();

    expect(
      moritzGlyphObjectSelectionFromCObjectId(
        defaultFont,
        char,
        moritzStrokeCObjectId(defaultFont.id, char, 0),
      ),
    ).toEqual({ kind: 'stroke', strokeIdx: 0 });

    expect(
      moritzGlyphObjectSelectionFromCObjectId(
        defaultFont,
        char,
        moritzAnchorCObjectId(defaultFont.id, char, 0, 0),
      ),
    ).toEqual({ kind: 'anchor', strokeIdx: 0, vIdx: 0 });

    expect(
      moritzGlyphObjectSelectionFromCObjectId(
        defaultFont,
        char,
        moritzHandleCObjectId(defaultFont.id, char, 0, 0, 'out'),
      ),
    ).toEqual({ kind: 'anchor', strokeIdx: 0, vIdx: 0 });
  });
});

describe('moritzBubbleCObjectSelection', () => {
  it('builds bubble fonts as bubble -> layer -> glyph cObject trees', () => {
    const root = moritzBubbleFontCObject(defaultBubbleFont);
    const bubble = defaultBubbleFont.bubbles.speech!;
    const layer = bubble.layers[0]!;

    expect(root.children.map((node) => node.id)).toContain(
      moritzBubbleCObjectId(defaultBubbleFont.id, bubble.id),
    );
    const bubbleNode = root.children.find((node) => node.id === moritzBubbleCObjectId(defaultBubbleFont.id, bubble.id));
    const layerNode = bubbleNode?.children.find((node) => node.id === moritzBubbleLayerCObjectId(defaultBubbleFont.id, bubble.id, layer.id));

    expect(layerNode?.children[0]?.id).toBe(
      moritzBubbleLayerGlyphCObjectId(defaultBubbleFont.id, bubble.id, layer.id),
    );
  });

  it('selects a bubble layer and maps layer glyph descendants back to the layer', () => {
    const bubble = defaultBubbleFont.bubbles.speech!;
    const layer = bubble.layers[0]!;
    const result = moritzBubbleCObjectSelection(defaultBubbleFont, bubble.id, layer.id);

    expect(result.selected?.id).toBe(moritzBubbleLayerCObjectId(defaultBubbleFont.id, bubble.id, layer.id));
    expect(result.meta).toMatchObject({ role: 'bubbleLayer', bubbleId: bubble.id, layerId: layer.id });
    expect(
      moritzBubbleObjectSelectionFromCObjectId(
        defaultBubbleFont,
        bubble.id,
        moritzBubbleLayerGlyphCObjectId(defaultBubbleFont.id, bubble.id, layer.id),
      ),
    ).toEqual({ kind: 'layer', layerId: layer.id });
  });
});

describe('moritzTypeSetterPageCObjectSelection', () => {
  it('builds live TypeSetter pages as page -> block -> text/bubble/layer trees', () => {
    const block = sampleBlock();
    const layer = defaultBubbleFont.bubbles.speech!.layers[0]!;
    const input = {
      pageId: 'live',
      pageName: 'Live page',
      blocks: [block],
      bubbleFont: defaultBubbleFont,
    };
    const root = moritzTypeSetterPageCObject(input);
    const blockNode = root.children[0]!;
    const bubbleNode = blockNode.children.find(
      (node) => node.id === moritzPageBlockCObjectId('live', block.id) + '.bubble',
    );

    expect(root.id).toBe(moritzPageCObjectId('live'));
    expect(blockNode.id).toBe(moritzPageBlockCObjectId('live', block.id));
    expect(blockNode.children.map((node) => node.id)).toContain(
      moritzPageBlockTextCObjectId('live', block.id),
    );
    expect(bubbleNode?.children.map((node) => node.id)).toContain(
      moritzPageBlockBubbleLayerCObjectId('live', block.id, layer.id),
    );
  });

  it('selects a TypeSetter bubble layer when a block is being bubble-edited', () => {
    const block = sampleBlock();
    const layer = defaultBubbleFont.bubbles.speech!.layers[0]!;
    const input = {
      pageId: 'live',
      pageName: 'Live page',
      blocks: [block],
      bubbleFont: defaultBubbleFont,
    };
    const result = moritzTypeSetterPageCObjectSelection(input, {
      blockId: block.id,
      layerId: layer.id,
    });

    expect(result.selected?.id).toBe(moritzPageBlockBubbleLayerCObjectId('live', block.id, layer.id));
    expect(result.meta).toMatchObject({ role: 'bubbleLayer', blockId: block.id, layerId: layer.id });
    expect(
      moritzTypeSetterObjectSelectionFromCObjectId(input, result.selected!.id),
    ).toEqual({ kind: 'bubbleLayer', blockId: block.id, layerId: layer.id });
  });
});

function firstChar(): string {
  const char = Object.keys(defaultFont.glyphs)[0];
  if (!char) throw new Error('defaultFont has no glyphs');
  return char;
}

function firstCharWithStroke(): string {
  const char = Object.keys(defaultFont.glyphs).find(
    (key) => (defaultFont.glyphs[key]?.strokes.length ?? 0) > 0,
  );
  if (!char) throw new Error('defaultFont has no stroked glyphs');
  return char;
}

function sampleBlock(): LegacyTextBlock {
  return {
    id: 'block-1',
    x: 10,
    y: 20,
    fontSize: 32,
    text: 'Hello Moritz',
    bold: 1,
    italic: 0,
    shape: 'preset',
    bubbleW: 200,
    bubbleH: 140,
    tailX: 60,
    tailY: 120,
    bubbleStroke: 2,
    bubblePresetId: 'speech',
  };
}
