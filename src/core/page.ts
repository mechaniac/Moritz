/**
 * Pure converters between the canonical Page → Block → TextRun shape
 * (the on-disk save format) and the legacy flat TextBlock shape that
 * the runtime store still uses today.
 *
 * No DOM, no React, no I/O — these are JSON-in, JSON-out helpers used
 * by `state/pagePersistence.ts` (load / save / migrate v1 → v2 envelope).
 *
 * Naming convention:
 *   - `legacyBlockToBlock` / `blockToLegacyBlock`   — single block.
 *   - `legacyPageToPage`   / `pageToLegacyPage`     — full page envelope.
 *
 * The runtime store will eventually adopt `Block`/`TextRun` directly;
 * once that happens these converters move to a one-shot v1-only loader
 * and the round-trip pair disappears.
 */

import type {
  Block,
  BlockBubble,
  Bubble,
  BubbleFont,
  Font,
  LegacyPage,
  LegacyTextBlock,
  Page,
  PageLibrary,
  Style,
  TextRun,
} from './types.js';

// ---- Library ---------------------------------------------------------------

export const EMPTY_LIBRARY: PageLibrary = {
  fonts: {},
  styles: {},
  bubbleFonts: {},
};

/**
 * Build a one-entry library from the active globals. Used while the
 * runtime is still single-font / single-style / single-bubble-font; the
 * canonical page shape always carries the full library.
 */
export function singleEntryLibrary(args: {
  readonly font: Font;
  readonly style: Style;
  readonly bubbleFont: BubbleFont;
}): PageLibrary {
  return {
    fonts: { [args.font.id]: args.font },
    styles: { [args.style.id]: args.style },
    bubbleFonts: { [args.bubbleFont.id]: args.bubbleFont },
  };
}

// ---- Block ↔ legacy --------------------------------------------------------

/**
 * Convert a saved-or-runtime `LegacyTextBlock` to the canonical `Block`.
 * Bubble-related fields collapse onto a single `BlockBubble` (or
 * `undefined` when the legacy block had `shape === 'none'`).
 *
 * Per-block `fontId` / `styleId` (when present on the legacy block)
 * win over `refs.fontId` / `refs.styleId`. This lets a runtime block
 * pin its own font / style picker selection while still falling back
 * to the active globals when unset.
 */
export function legacyBlockToBlock(
  legacy: LegacyTextBlock,
  refs: { readonly fontId: string; readonly styleId: string; readonly bubbleFontId: string },
): Block {
  const text: TextRun = {
    id: `${legacy.id}_t0`,
    text: legacy.text,
    fontId: legacy.fontId ?? refs.fontId,
    styleId: legacy.styleId ?? refs.styleId,
    fontSize: legacy.fontSize,
    ...(legacy.align ? { align: legacy.align } : {}),
    ...(legacy.bold !== 1 ? { boldFactor: legacy.bold } : {}),
    ...(legacy.italic !== 0 ? { slantDelta: legacy.italic } : {}),
  };
  const bubble = legacyBubbleOf(legacy, refs);
  return {
    id: legacy.id,
    x: legacy.x,
    y: legacy.y,
    w: legacy.bubbleW,
    h: legacy.bubbleH,
    ...(bubble ? { bubble } : {}),
    texts: [text],
  };
}

function legacyBubbleOf(
  legacy: LegacyTextBlock,
  refs: { readonly styleId: string; readonly bubbleFontId: string },
): BlockBubble | undefined {
  const shape = legacy.shape;
  if (shape === 'none' || shape === '') return undefined;
  const common = {
    styleId: refs.styleId,
    stroke: legacy.bubbleStroke,
    tailX: legacy.tailX,
    tailY: legacy.tailY,
  } as const;
  if (shape === 'preset' && legacy.bubblePresetId) {
    return {
      ...common,
      source: {
        kind: 'preset',
        bubbleFontId: refs.bubbleFontId,
        bubbleId: legacy.bubblePresetId,
        ...(legacy.bubble ? { override: legacy.bubble } : {}),
      },
    };
  }
  if (shape === 'rect' || shape === 'speech' || shape === 'cloud') {
    return { ...common, source: { kind: 'shape', shape } };
  }
  // Unknown shape — drop the bubble rather than make something up.
  return undefined;
}

/**
 * Inverse of `legacyBlockToBlock`. Used by the runtime (which still
 * speaks `LegacyTextBlock`) to ingest a canonical Block.
 *
 * `activeRefs`, when supplied, lets the runtime stay decoupled from the
 * active globals: a TextRun whose `fontId` / `styleId` matches the
 * active-globals sentinel is converted back to an *unset* runtime
 * `fontId` / `styleId` (so the block "tracks active globals" again).
 * Real per-block selections (built-in font ids, etc.) survive verbatim.
 */
export function blockToLegacyBlock(
  block: Block,
  activeRefs?: { readonly fontId: string; readonly styleId: string },
): LegacyTextBlock {
  const run = block.texts[0];
  const text = run?.text ?? '';
  const fontSize = run?.fontSize ?? 24;
  const align = run?.align;
  const bold = run?.boldFactor ?? 1;
  const italic = run?.slantDelta ?? 0;
  const bubble = block.bubble;
  let shape = 'none';
  let presetId: string | undefined;
  let override: Bubble | undefined;
  if (bubble) {
    if (bubble.source.kind === 'preset') {
      shape = 'preset';
      presetId = bubble.source.bubbleId;
      override = bubble.source.override;
    } else {
      shape = bubble.source.shape;
    }
  }
  // Strip the "active" sentinel so an unset runtime field = "track active globals".
  const runtimeFontId =
    run?.fontId && run.fontId !== activeRefs?.fontId ? run.fontId : undefined;
  const runtimeStyleId =
    run?.styleId && run.styleId !== activeRefs?.styleId ? run.styleId : undefined;
  return {
    id: block.id,
    x: block.x,
    y: block.y,
    fontSize,
    text,
    bold,
    italic,
    shape,
    bubbleW: block.w,
    bubbleH: block.h,
    tailX: bubble?.tailX ?? 0,
    tailY: bubble?.tailY ?? 0,
    bubbleStroke: bubble?.stroke ?? 1,
    ...(align ? { align } : {}),
    ...(runtimeFontId ? { fontId: runtimeFontId } : {}),
    ...(runtimeStyleId ? { styleId: runtimeStyleId } : {}),
    ...(presetId ? { bubblePresetId: presetId } : {}),
    ...(override ? { bubble: override } : {}),
  };
}

// ---- Page ↔ legacy ---------------------------------------------------------

/**
 * Convert a v1 saved page into the canonical v2 shape. The library is
 * supplied by the caller (typically the active globals at load time)
 * since v1 envelopes did not carry one.
 */
export function legacyPageToPage(
  legacy: LegacyPage,
  library: PageLibrary,
  refs: { readonly fontId: string; readonly styleId: string; readonly bubbleFontId: string },
): Page {
  return {
    id: legacy.id,
    name: legacy.name,
    w: legacy.pageW,
    h: legacy.pageH,
    ...(legacy.background ? { background: legacy.background } : {}),
    blocks: legacy.blocks.map((b) => legacyBlockToBlock(b, refs)),
    library,
  };
}

/**
 * Build a canonical Page from the runtime's flat block list + the
 * active library. Use this at save time; it does NOT mutate inputs.
 */
export function buildPage(args: {
  readonly id: string;
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly background?: string;
  readonly blocks: readonly LegacyTextBlock[];
  readonly library: PageLibrary;
  readonly refs: { readonly fontId: string; readonly styleId: string; readonly bubbleFontId: string };
}): Page {
  return {
    id: args.id,
    name: args.name,
    w: args.w,
    h: args.h,
    ...(args.background ? { background: args.background } : {}),
    blocks: args.blocks.map((b) => legacyBlockToBlock(b, args.refs)),
    library: args.library,
  };
}

// ---- Envelope sniff --------------------------------------------------------

/** True when an arbitrary parsed JSON value matches the canonical Page shape. */
export function isCanonicalPage(value: unknown): value is Page {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.w === 'number' &&
    typeof v.h === 'number' &&
    Array.isArray(v.blocks) &&
    typeof v.library === 'object' &&
    v.library !== null
  );
}

/** True when an arbitrary parsed JSON value matches the legacy v1 page shape. */
export function isLegacyPage(value: unknown): value is LegacyPage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.pageW === 'number' &&
    typeof v.pageH === 'number' &&
    Array.isArray(v.blocks)
  );
}
