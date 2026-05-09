import { useEffect, useRef, useState } from 'react';
import {
  deletePage,
  exportPageJson,
  importPageJson,
  listPageIds,
  loadPage,
  savePage,
  type MigrationContext,
} from '../state/pagePersistence.js';
import { downloadBlob } from '../state/persistence.js';
import { useTypesetterStore } from '../state/typesetterStore.js';
import { useAppStore } from '../state/store.js';
import { useBubbleStore } from '../state/bubbleStore.js';
import {
  blockToLegacyBlock,
  buildPage,
  singleEntryLibrary,
} from '../core/page.js';
import type { Page, Style } from '../core/types.js';

/**
 * Save / load / import / export the active Page (the TypeSetter scene).
 *
 * Save format: canonical `Page` (envelope v2) — see `core/page.ts`. The
 * library is snapshotted from the active Font / Style / BubbleFont so
 * the file is fully self-contained.
 *
 * The runtime store still uses the flat `TextBlock` shape; converters
 * in `core/page.ts` bridge the two at this boundary.
 */

// Synthetic ids assigned to the active globals when snapshotting the
// page library. Once the per-text font/style picker lands these get
// replaced by real picker-driven ids and the page can mix multiple.
const ACTIVE_FONT_ID = 'active-font';
const ACTIVE_STYLE_ID = 'active-style';
const ACTIVE_BUBBLE_FONT_ID = 'active-bubble-font';

export function PageBar(): JSX.Element {
  const pageImage = useTypesetterStore((s) => s.pageImage);
  const pageW = useTypesetterStore((s) => s.pageW);
  const pageH = useTypesetterStore((s) => s.pageH);
  const blocks = useTypesetterStore((s) => s.blocks);
  const setPage = useTypesetterStore((s) => s.setPage);
  const replaceBlocks = useTypesetterStore((s) => s.replaceBlocks);
  const font = useAppStore((s) => s.font);
  const styleSettings = useAppStore((s) => s.style);
  const bubbleFont = useBubbleStore((s) => s.font);
  const [savedIds, setSavedIds] = useState<string[]>(() => listPageIds());
  const [activeId, setActiveId] = useState<string>('untitled');
  const [name, setName] = useState<string>('Untitled');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSavedIds(listPageIds());
  }, []);

  // Build the migration context (used when loading legacy v1 envelopes
  // and as the library snapshot when saving). Recomputed on every
  // call site so the snapshot reflects the live globals.
  const migrationContext = (): MigrationContext => {
    const style: Style = {
      id: ACTIVE_STYLE_ID,
      name: 'Active Style',
      settings: styleSettings,
    };
    const fontSnapshot = { ...font, id: ACTIVE_FONT_ID };
    const bubbleSnapshot = { ...bubbleFont, id: ACTIVE_BUBBLE_FONT_ID };
    return {
      library: singleEntryLibrary({
        font: fontSnapshot,
        style,
        bubbleFont: bubbleSnapshot,
      }),
      refs: {
        fontId: ACTIVE_FONT_ID,
        styleId: ACTIVE_STYLE_ID,
        bubbleFontId: ACTIVE_BUBBLE_FONT_ID,
      },
    };
  };

  const buildCurrentPage = (): Page => {
    const ctx = migrationContext();
    return buildPage({
      id: sanitizeId(name),
      name,
      w: pageW,
      h: pageH,
      ...(pageImage ? { background: pageImage } : {}),
      blocks,
      library: ctx.library,
      refs: ctx.refs,
    });
  };

  const onSave = () => {
    const p = buildCurrentPage();
    try {
      savePage(p);
      setSavedIds(listPageIds());
      setActiveId(p.id);
    } catch {
      alert('Saving page to browser storage failed (likely too large — use Export instead).');
    }
  };
  const applyPage = (p: Page) => {
    setPage(p.background ?? '', p.w, p.h);
    const ctx = migrationContext();
    replaceBlocks(
      p.blocks.map((b) => {
        const legacy = blockToLegacyBlock(b, ctx.refs);
        return {
          ...legacy,
          shape: legacy.shape as unknown as import('../core/bubble.js').BubbleShape,
        };
      }),
    );
    setActiveId(p.id);
    setName(p.name);
  };
  const onLoad = (id: string) => {
    if (!id) return;
    const p = loadPage(id, migrationContext());
    if (!p) return;
    applyPage(p);
  };
  const onDeleteCurrent = () => {
    if (!savedIds.includes(activeId)) return;
    if (!confirm(`Delete saved page "${name}"?`)) return;
    deletePage(activeId);
    setSavedIds(listPageIds());
  };
  const onExport = () => {
    const json = exportPageJson(buildCurrentPage());
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`${sanitizeId(name)}-${stamp}.page.moritz.json`, json, 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const p = importPageJson(text, migrationContext());
      applyPage(p);
      try {
        savePage(p);
        setSavedIds(listPageIds());
      } catch {
        // Too large for localStorage — that's fine, in-memory state still works.
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const options: { id: string; label: string; disabled?: boolean }[] = [];
  if (savedIds.length === 0) {
    options.push({ id: '__h_empty', label: '— No saved pages —', disabled: true });
  } else {
    options.push({ id: '__h_saved', label: '— Saved —', disabled: true });
    for (const id of savedIds) options.push({ id, label: id });
  }
  if (!options.some((o) => o.id === activeId)) {
    options.push({ id: '__h_unsaved', label: '— Unsaved —', disabled: true });
    options.push({ id: activeId, label: `${name} (unsaved)` });
  }

  return (
    <div className="mz-fontbar mz-pagebar" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={activeId}
        onChange={(e) => onLoad(e.target.value)}
        title="Switch page"
        style={{ minWidth: 140 }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '4px 6px', width: 120 }}
        placeholder="Page name"
      />
      <button className="mz-btn--warn" onClick={onSave} title="Save the active page (image + blocks).">Save</button>
      <button
        className="mz-btn--warn"
        onClick={onDeleteCurrent}
        disabled={!savedIds.includes(activeId)}
      >
        Delete
      </button>
      <button onClick={onExport} title="Download a .page.moritz.json file.">Export</button>
      <button onClick={() => fileInput.current?.click()} title="Load a .page.moritz.json file.">Import</button>
      <input
        ref={fileInput}
        type="file"
        accept=".page.moritz.json,.moritz.json,.json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function sanitizeId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}
