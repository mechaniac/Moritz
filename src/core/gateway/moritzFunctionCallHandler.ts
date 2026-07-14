/**
 * Moritz gateway function call handler.
 *
 * Intercepts gateway function calls from magdalena and dispatches them to
 * the appropriate Zustand store. Returns `true` to suppress magdalena's
 * default tree-transform execution path.
 */

import type { MFunctionCallHandler } from '@christof/magdalena/panels';
import {
  deleteFont,
  downloadBlob,
  exportFontJson,
  listFontIds,
  loadFontEnvelope,
  saveFont,
  writeFontFile,
} from '../../state/persistence.js';
import {
  deleteBubbleFont,
  exportBubbleFontJson,
  listBubbleFontIds,
  loadBubbleFontEnvelope,
  saveBubbleFont,
  writeBubbleFontFile,
} from '../../state/bubblePersistence.js';
import {
  deleteStyle,
  exportStyleJson,
  listStyleIds,
  loadStyle,
  saveStyle,
} from '../../state/stylePersistence.js';
import {
  deletePage,
  exportPageJson,
  listPageIds,
  loadPage,
  savePage,
} from '../../state/pagePersistence.js';
import { useAppStore } from '../../state/store.js';
import { useBubbleStore } from '../../state/bubbleStore.js';
import { useTypesetterStore } from '../../state/typesetterStore.js';
import {
  getBuiltInFont,
  isBuiltInId,
  resetBuiltInFont,
} from '../../data/builtInFonts.js';
import {
  getBuiltInBubbleFont,
  isBuiltInBubbleId,
  resetBuiltInBubbleFont,
} from '../../data/builtInBubbleFonts.js';
import {
  getBuiltInStyle,
  isBuiltInStyleId,
  resetBuiltInStyle,
} from '../../data/builtInStyles.js';
import type { Style } from '../../core/types.js';
import {
  addStroke,
  deleteAnchor,
  deleteStroke,
  flipStrokeHorizontal,
  flipStrokeVertical,
  insertAnchor,
} from '../../core/glyphOps.js';
import {
  ACTIVE_PAGE_REFS,
  blockToLegacyBlock,
  buildPage,
  singleEntryLibrary,
} from '../../core/page.js';
import type { MigrationContext } from '../../state/pagePersistence.js';
import { MORITZ_MODULE_ID } from '../../moduleSkins.js';
import {
  getGlyphSetterSelection,
  setGlyphSetterSelection,
} from '../../modules/glyphsetter/GlyphSetter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Font handlers
// ---------------------------------------------------------------------------

function handleSaveFont(args: Readonly<Record<string, unknown>>): boolean {
  const name = String(args['name'] ?? '').trim();
  if (!name) return true; // silently reject empty name
  const id = sanitizeId(name);
  const state = useAppStore.getState();
  const toSave = { ...state.font, id, name };
  saveFont(toSave, state.glyphView);
  useAppStore.setState({ font: toSave });
  return true;
}

function handleLoadFont(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const loadFontIntoStore = useAppStore.getState().loadFont;
  if (isBuiltInId(id)) {
    const f = getBuiltInFont(id);
    if (f) loadFontIntoStore(f.font, f.view);
  } else {
    const env = loadFontEnvelope(id);
    if (env) loadFontIntoStore(env.font, env.view);
  }
  return true;
}

function handleDeleteFont(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const builtIn = isBuiltInId(id);
  const saved = listFontIds().includes(id);
  if (!saved) return true;
  if (builtIn) {
    const original = resetBuiltInFont(id);
    if (original) useAppStore.getState().loadFont(original);
  } else {
    deleteFont(id);
  }
  return true;
}

function handleExportFont(): boolean {
  const state = useAppStore.getState();
  const json = exportFontJson(state.font, state.glyphView);
  const stamp = timestamp();
  downloadBlob(`${state.font.id}-${stamp}.moritz.json`, json, 'application/json');
  if (import.meta.env?.DEV) {
    void writeFontFile(state.font.id, JSON.stringify(JSON.parse(json), null, 2));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Bubble font handlers
// ---------------------------------------------------------------------------

function handleSaveBubbleFont(args: Readonly<Record<string, unknown>>): boolean {
  const name = String(args['name'] ?? '').trim();
  if (!name) return true;
  const id = sanitizeId(name);
  const state = useBubbleStore.getState();
  const toSave = { ...state.font, id, name };
  saveBubbleFont(toSave, state.view);
  useBubbleStore.setState({ font: toSave });
  return true;
}

function handleLoadBubbleFont(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const loadBubbleFontIntoStore = useBubbleStore.getState().loadBubbleFont;
  if (isBuiltInBubbleId(id)) {
    const f = getBuiltInBubbleFont(id);
    if (f) loadBubbleFontIntoStore(f.font, f.view);
  } else {
    const env = loadBubbleFontEnvelope(id);
    if (env) loadBubbleFontIntoStore(env.font, env.view);
  }
  return true;
}

function handleDeleteBubbleFont(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const saved = listBubbleFontIds().includes(id);
  if (!saved) return true;
  if (isBuiltInBubbleId(id)) {
    const original = resetBuiltInBubbleFont(id);
    if (original) useBubbleStore.getState().loadBubbleFont(original);
  } else {
    deleteBubbleFont(id);
  }
  return true;
}

function handleExportBubbleFont(): boolean {
  const state = useBubbleStore.getState();
  const json = exportBubbleFontJson(state.font, state.view);
  const stamp = timestamp();
  downloadBlob(`${state.font.id}-${stamp}.moritz-bubbles.json`, json, 'application/json');
  if (import.meta.env?.DEV) {
    void writeBubbleFontFile(state.font.id, JSON.stringify(JSON.parse(json), null, 2));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Style handlers
// ---------------------------------------------------------------------------

function handleSaveStyle(args: Readonly<Record<string, unknown>>): boolean {
  const name = String(args['name'] ?? '').trim();
  if (!name) return true;
  const id = sanitizeId(name);
  const style = useAppStore.getState().style;
  const toSave: Style = { id, name, settings: style };
  saveStyle(toSave);
  useAppStore.getState().loadStyleSettings(style);
  return true;
}

function handleLoadStyle(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  let s: Style | undefined;
  if (isBuiltInStyleId(id)) {
    s = getBuiltInStyle(id);
  } else {
    s = loadStyle(id) ?? undefined;
  }
  if (s) useAppStore.getState().loadStyleSettings(s.settings);
  return true;
}

function handleDeleteStyle(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const saved = listStyleIds().includes(id);
  if (!saved) return true;
  if (isBuiltInStyleId(id)) {
    const original = resetBuiltInStyle(id);
    if (original) useAppStore.getState().loadStyleSettings(original.settings);
  } else {
    deleteStyle(id);
  }
  return true;
}

function handleExportStyle(): boolean {
  const style = useAppStore.getState().style;
  const toSave: Style = { id: 'exported', name: 'Exported', settings: style };
  const json = exportStyleJson(toSave);
  const stamp = timestamp();
  downloadBlob(`style-${stamp}.style.moritz.json`, json, 'application/json');
  return true;
}

// ---------------------------------------------------------------------------
// Page handlers
// ---------------------------------------------------------------------------

function buildMigrationContext(): MigrationContext {
  const styleSettings = useAppStore.getState().style;
  const font = useAppStore.getState().font;
  const bubbleFont = useBubbleStore.getState().font;
  const style: Style = {
    id: ACTIVE_PAGE_REFS.styleId,
    name: 'Active Style',
    settings: styleSettings,
  };
  return {
    library: singleEntryLibrary({
      font: { ...font, id: ACTIVE_PAGE_REFS.fontId },
      style,
      bubbleFont: { ...bubbleFont, id: ACTIVE_PAGE_REFS.bubbleFontId },
    }),
    refs: ACTIVE_PAGE_REFS,
  };
}

function handleSavePage(args: Readonly<Record<string, unknown>>): boolean {
  const name = String(args['name'] ?? '').trim();
  if (!name) return true;
  const id = sanitizeId(name);
  const ts = useTypesetterStore.getState();
  const ctx = buildMigrationContext();
  const page = buildPage({
    id,
    name,
    w: ts.pageW,
    h: ts.pageH,
    ...(ts.pageImage ? { background: ts.pageImage } : {}),
    blocks: ts.blocks,
    library: ctx.library,
    refs: ctx.refs,
  });
  try {
    savePage(page);
  } catch {
    // localStorage full — caller should use export instead
  }
  return true;
}

function handleLoadPage(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  const ctx = buildMigrationContext();
  const p = loadPage(id, ctx);
  if (!p) return true;
  const ts = useTypesetterStore.getState();
  ts.setPage(p.background ?? '', p.w, p.h);
  ts.replaceBlocks(
    p.blocks.map((b) => {
      const legacy = blockToLegacyBlock(b, ctx.refs);
      return {
        ...legacy,
        shape: legacy.shape as unknown as import('../../core/bubble.js').BubbleShape,
      };
    }),
  );
  return true;
}

function handleDeletePage(args: Readonly<Record<string, unknown>>): boolean {
  const id = String(args['id'] ?? '');
  if (!id) return true;
  if (!listPageIds().includes(id)) return true;
  deletePage(id);
  return true;
}

function handleExportPage(): boolean {
  const ts = useTypesetterStore.getState();
  const ctx = buildMigrationContext();
  const page = buildPage({
    id: 'export',
    name: 'Export',
    w: ts.pageW,
    h: ts.pageH,
    ...(ts.pageImage ? { background: ts.pageImage } : {}),
    blocks: ts.blocks,
    library: ctx.library,
    refs: ctx.refs,
  });
  const json = exportPageJson(page);
  const stamp = timestamp();
  downloadBlob(`page-${stamp}.page.moritz.json`, json, 'application/json');
  return true;
}

// ---------------------------------------------------------------------------
// Glyph editing handlers
// ---------------------------------------------------------------------------

function handleAddStroke(): boolean {
  const { font, selectedGlyph } = useAppStore.getState();
  const glyph = font.glyphs[selectedGlyph];
  if (!glyph) return true;
  useAppStore.getState().updateSelectedGlyph((g) => addStroke(g));
  return true;
}

function handleAddAnchor(): boolean {
  const { font, selectedGlyph } = useAppStore.getState();
  const glyph = font.glyphs[selectedGlyph];
  if (!glyph) return true;
  const selection = getGlyphSetterSelection();
  let strokeIdx = -1;
  let segIdx = -1;
  if (selection.kind === 'anchor') {
    const s = glyph.strokes[selection.strokeIdx];
    if (!s) return true;
    strokeIdx = selection.strokeIdx;
    segIdx = selection.vIdx < s.vertices.length - 1
      ? selection.vIdx
      : selection.vIdx - 1;
  } else if (selection.kind === 'stroke') {
    const s = glyph.strokes[selection.strokeIdx];
    if (!s || s.vertices.length < 2) return true;
    strokeIdx = selection.strokeIdx;
    segIdx = Math.floor((s.vertices.length - 1) / 2);
  } else {
    return true;
  }
  if (strokeIdx < 0 || segIdx < 0) return true;
  useAppStore.getState().updateSelectedGlyph((g) => insertAnchor(g, strokeIdx, segIdx, 0.5));
  setGlyphSetterSelection({ kind: 'anchor', strokeIdx, vIdx: segIdx + 1 });
  return true;
}

function handleDeleteSelected(): boolean {
  const { font, selectedGlyph } = useAppStore.getState();
  const glyph = font.glyphs[selectedGlyph];
  if (!glyph) return true;
  const selection = getGlyphSetterSelection();
  if (selection.kind === 'anchor') {
    useAppStore.getState().updateSelectedGlyph((g) =>
      deleteAnchor(g, selection.strokeIdx, selection.vIdx),
    );
    setGlyphSetterSelection({ kind: 'none' });
    return true;
  }
  const selectedStrokeIdxs: readonly number[] = (() => {
    if (selection.kind === 'stroke') return [selection.strokeIdx];
    if (selection.kind === 'multi') return selection.strokeIdxs;
    return [];
  })();
  if (selectedStrokeIdxs.length === 0) return true;
  const idxs = [...selectedStrokeIdxs].sort((a, b) => b - a);
  useAppStore.getState().updateSelectedGlyph((g) =>
    idxs.reduce((acc, i) => deleteStroke(acc, i), g),
  );
  setGlyphSetterSelection({ kind: 'none' });
  return true;
}

function handleFlipH(): boolean {
  const { font, selectedGlyph } = useAppStore.getState();
  const glyph = font.glyphs[selectedGlyph];
  if (!glyph) return true;
  const selection = getGlyphSetterSelection();
  const selectedStrokeIdxs: readonly number[] = (() => {
    if (selection.kind === 'stroke') return [selection.strokeIdx];
    if (selection.kind === 'anchor') return [selection.strokeIdx];
    if (selection.kind === 'multi') return selection.strokeIdxs;
    return [];
  })();
  if (selectedStrokeIdxs.length === 0) return true;
  useAppStore.getState().updateSelectedGlyph((g) =>
    selectedStrokeIdxs.reduce((acc, i) => flipStrokeHorizontal(acc, i, g.box.w / 2), g),
  );
  return true;
}

function handleFlipV(): boolean {
  const { font, selectedGlyph } = useAppStore.getState();
  const glyph = font.glyphs[selectedGlyph];
  if (!glyph) return true;
  const selection = getGlyphSetterSelection();
  const selectedStrokeIdxs: readonly number[] = (() => {
    if (selection.kind === 'stroke') return [selection.strokeIdx];
    if (selection.kind === 'anchor') return [selection.strokeIdx];
    if (selection.kind === 'multi') return selection.strokeIdxs;
    return [];
  })();
  if (selectedStrokeIdxs.length === 0) return true;
  useAppStore.getState().updateSelectedGlyph((g) =>
    selectedStrokeIdxs.reduce((acc, i) => flipStrokeVertical(acc, i, g.box.h / 2), g),
  );
  return true;
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const handlers: Readonly<Record<string, (args: Readonly<Record<string, unknown>>) => boolean>> = {
  saveFont: handleSaveFont,
  loadFont: handleLoadFont,
  deleteFont: handleDeleteFont,
  exportFont: handleExportFont,
  addStroke: handleAddStroke,
  addAnchor: handleAddAnchor,
  deleteSelected: handleDeleteSelected,
  flipH: handleFlipH,
  flipV: handleFlipV,
  saveBubbleFont: handleSaveBubbleFont,
  loadBubbleFont: handleLoadBubbleFont,
  deleteBubbleFont: handleDeleteBubbleFont,
  exportBubbleFont: handleExportBubbleFont,
  saveStyle: handleSaveStyle,
  loadStyle: handleLoadStyle,
  deleteStyle: handleDeleteStyle,
  exportStyle: handleExportStyle,
  // Style sliders are NOT intercepted — they are real tree transforms.
  // Magdalena executes fn.call(tree, args) → onTreeChange → runtime records undo.
  // Sync to Zustand happens in the onTreeChange handler (app-mount.ts).
  savePage: handleSavePage,
  loadPage: handleLoadPage,
  deletePage: handleDeletePage,
  exportPage: handleExportPage,
};

/**
 * Moritz function call handler. Intercepts gateway calls and dispatches to
 * Zustand stores. Returns `true` for every known Moritz function (preventing
 * magdalena from running `fn.call(tree, args)`).
 */
export const moritzFunctionCallHandler: MFunctionCallHandler = (call) => {
  if (call.moduleId !== MORITZ_MODULE_ID) return false;
  if (call.reset) return true; // swallow reset events
  const handler = handlers[call.name];
  if (!handler) return false;
  return handler(call.args);
};
