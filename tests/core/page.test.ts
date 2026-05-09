import { describe, expect, test } from 'vitest';
import {
  EMPTY_LIBRARY,
  blockToLegacyBlock,
  buildPage,
  isCanonicalPage,
  isLegacyPage,
  legacyBlockToBlock,
  legacyPageToPage,
  singleEntryLibrary,
} from '../../src/core/page.js';
import type {
  BubbleFont,
  Font,
  LegacyPage,
  LegacyTextBlock,
  Style,
} from '../../src/core/types.js';

const REFS = { fontId: 'F', styleId: 'S', bubbleFontId: 'B' } as const;

const LEGACY_PRESET: LegacyTextBlock = {
  id: 'b1',
  x: 10,
  y: 20,
  fontSize: 24,
  text: 'Hi',
  bold: 1.2,
  italic: 0.05,
  shape: 'preset',
  bubbleW: 200,
  bubbleH: 120,
  tailX: 30,
  tailY: 100,
  bubbleStroke: 2,
  align: 'center',
  bubblePresetId: 'oval',
};

const LEGACY_NONE: LegacyTextBlock = {
  ...LEGACY_PRESET,
  id: 'b2',
  shape: 'none',
  bold: 1,
  italic: 0,
  align: undefined,
  bubblePresetId: undefined,
};

const LEGACY_SHAPE: LegacyTextBlock = {
  ...LEGACY_PRESET,
  id: 'b3',
  shape: 'speech',
  bubblePresetId: undefined,
};

describe('legacyBlockToBlock', () => {
  test('preset bubble + bold + italic + align all promoted', () => {
    const b = legacyBlockToBlock(LEGACY_PRESET, REFS);
    expect(b.id).toBe('b1');
    expect(b.x).toBe(10);
    expect(b.w).toBe(200);
    expect(b.h).toBe(120);
    expect(b.texts).toHaveLength(1);
    const t = b.texts[0]!;
    expect(t.text).toBe('Hi');
    expect(t.fontId).toBe('F');
    expect(t.styleId).toBe('S');
    expect(t.fontSize).toBe(24);
    expect(t.boldFactor).toBe(1.2);
    expect(t.slantDelta).toBe(0.05);
    expect(t.align).toBe('center');
    expect(b.bubble?.source.kind).toBe('preset');
    if (b.bubble?.source.kind === 'preset') {
      expect(b.bubble.source.bubbleFontId).toBe('B');
      expect(b.bubble.source.bubbleId).toBe('oval');
    }
    expect(b.bubble?.stroke).toBe(2);
    expect(b.bubble?.tailX).toBe(30);
  });

  test('shape "none" yields no bubble; default bold/italic stripped', () => {
    const b = legacyBlockToBlock(LEGACY_NONE, REFS);
    expect(b.bubble).toBeUndefined();
    expect(b.texts[0]!.boldFactor).toBeUndefined();
    expect(b.texts[0]!.slantDelta).toBeUndefined();
    expect(b.texts[0]!.align).toBeUndefined();
  });

  test('legacy programmatic shape kept as { kind: "shape" }', () => {
    const b = legacyBlockToBlock(LEGACY_SHAPE, REFS);
    expect(b.bubble?.source).toEqual({ kind: 'shape', shape: 'speech' });
  });
});

describe('round-trip legacy → canonical → legacy', () => {
  test('preset block: lossless on the fields the runtime cares about', () => {
    const round = blockToLegacyBlock(legacyBlockToBlock(LEGACY_PRESET, REFS));
    expect(round.id).toBe(LEGACY_PRESET.id);
    expect(round.x).toBe(LEGACY_PRESET.x);
    expect(round.y).toBe(LEGACY_PRESET.y);
    expect(round.fontSize).toBe(LEGACY_PRESET.fontSize);
    expect(round.text).toBe(LEGACY_PRESET.text);
    expect(round.bold).toBe(LEGACY_PRESET.bold);
    expect(round.italic).toBe(LEGACY_PRESET.italic);
    expect(round.shape).toBe('preset');
    expect(round.bubbleW).toBe(LEGACY_PRESET.bubbleW);
    expect(round.bubbleH).toBe(LEGACY_PRESET.bubbleH);
    expect(round.tailX).toBe(LEGACY_PRESET.tailX);
    expect(round.tailY).toBe(LEGACY_PRESET.tailY);
    expect(round.bubbleStroke).toBe(LEGACY_PRESET.bubbleStroke);
    expect(round.align).toBe(LEGACY_PRESET.align);
    expect(round.bubblePresetId).toBe(LEGACY_PRESET.bubblePresetId);
  });

  test('none block: lossless', () => {
    const round = blockToLegacyBlock(legacyBlockToBlock(LEGACY_NONE, REFS));
    expect(round.shape).toBe('none');
    expect(round.bubblePresetId).toBeUndefined();
    expect(round.bold).toBe(1);
    expect(round.italic).toBe(0);
  });

  test('shape block: lossless', () => {
    const round = blockToLegacyBlock(legacyBlockToBlock(LEGACY_SHAPE, REFS));
    expect(round.shape).toBe('speech');
  });
});

describe('legacyPageToPage', () => {
  const lib = EMPTY_LIBRARY;
  test('promotes pageW/pageH, drops background when missing, copies blocks', () => {
    const lp: LegacyPage = {
      id: 'p1',
      name: 'P',
      pageW: 800,
      pageH: 1000,
      blocks: [LEGACY_PRESET, LEGACY_NONE],
    };
    const p = legacyPageToPage(lp, lib, REFS);
    expect(p.w).toBe(800);
    expect(p.h).toBe(1000);
    expect(p.background).toBeUndefined();
    expect(p.blocks).toHaveLength(2);
    expect(p.library).toBe(lib);
  });

  test('keeps background when present', () => {
    const lp: LegacyPage = {
      id: 'p1', name: 'P', pageW: 1, pageH: 1, background: 'data:foo', blocks: [],
    };
    expect(legacyPageToPage(lp, lib, REFS).background).toBe('data:foo');
  });
});

describe('buildPage', () => {
  test('snapshots the library by reference and drops background when missing', () => {
    const lib = EMPTY_LIBRARY;
    const p = buildPage({
      id: 'p', name: 'P', w: 100, h: 200,
      blocks: [LEGACY_PRESET], library: lib, refs: REFS,
    });
    expect(p.library).toBe(lib);
    expect(p.background).toBeUndefined();
    expect(p.blocks).toHaveLength(1);
  });
});

describe('singleEntryLibrary', () => {
  test('keys each entry by its own id', () => {
    const font = { id: 'fid', name: '', style: {} as never, glyphs: {} } as Font;
    const style: Style = { id: 'sid', name: '', settings: {} as never };
    const bf = { id: 'bid', name: '', style: {} as never, bubbles: {} } as BubbleFont;
    const lib = singleEntryLibrary({ font, style, bubbleFont: bf });
    expect(lib.fonts.fid).toBe(font);
    expect(lib.styles.sid).toBe(style);
    expect(lib.bubbleFonts.bid).toBe(bf);
  });
});

describe('envelope sniffers', () => {
  test('isCanonicalPage', () => {
    expect(isCanonicalPage({ id: 'x', w: 1, h: 1, blocks: [], library: {} })).toBe(true);
    expect(isCanonicalPage({ id: 'x', pageW: 1, pageH: 1, blocks: [] })).toBe(false);
    expect(isCanonicalPage(null)).toBe(false);
  });
  test('isLegacyPage', () => {
    expect(isLegacyPage({ id: 'x', pageW: 1, pageH: 1, blocks: [] })).toBe(true);
    expect(isLegacyPage({ id: 'x', w: 1, h: 1, blocks: [], library: {} })).toBe(false);
  });
});

describe('per-block fontId/styleId round-trip', () => {
  const REFS_ACTIVE = { fontId: 'active-font', styleId: 'active-style', bubbleFontId: 'active-bf' };

  test('unset runtime fontId/styleId ? canonical TextRun gets the active sentinel', () => {
    const block = legacyBlockToBlock(LEGACY_NONE, REFS_ACTIVE);
    expect(block.texts[0]!.fontId).toBe('active-font');
    expect(block.texts[0]!.styleId).toBe('active-style');
  });

  test('runtime fontId/styleId beat the active refs', () => {
    const legacy: LegacyTextBlock = { ...LEGACY_NONE, fontId: 'pinned-font', styleId: 'pinned-style' };
    const block = legacyBlockToBlock(legacy, REFS_ACTIVE);
    expect(block.texts[0]!.fontId).toBe('pinned-font');
    expect(block.texts[0]!.styleId).toBe('pinned-style');
  });

  test('on inverse, active sentinel is stripped (block tracks active globals)', () => {
    const block = legacyBlockToBlock(LEGACY_NONE, REFS_ACTIVE);
    const back = blockToLegacyBlock(block, REFS_ACTIVE);
    expect(back.fontId).toBeUndefined();
    expect(back.styleId).toBeUndefined();
  });

  test('on inverse, real id survives', () => {
    const legacy: LegacyTextBlock = { ...LEGACY_NONE, fontId: 'pinned-font' };
    const block = legacyBlockToBlock(legacy, REFS_ACTIVE);
    const back = blockToLegacyBlock(block, REFS_ACTIVE);
    expect(back.fontId).toBe('pinned-font');
  });
});
