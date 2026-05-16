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
  ACTIVE_PAGE_REFS,
  blockToLegacyBlock,
  buildPage,
  singleEntryLibrary,
} from '../core/page.js';
import type { Page, Style } from '../core/types.js';
import { MoritzLabel } from './MoritzText.js';
import { MoritzSelect } from './MoritzSelect.js';

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
      id: ACTIVE_PAGE_REFS.styleId,
      name: 'Active Style',
      settings: styleSettings,
    };
    const fontSnapshot = { ...font, id: ACTIVE_PAGE_REFS.fontId };
    const bubbleSnapshot = { ...bubbleFont, id: ACTIVE_PAGE_REFS.bubbleFontId };
    return {
      library: singleEntryLibrary({
        font: fontSnapshot,
        style,
        bubbleFont: bubbleSnapshot,
      }),
      refs: ACTIVE_PAGE_REFS,
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
    options.push({ id: '__h_empty', label: 'No saved pages', disabled: true });
  } else {
    options.push({ id: '__h_saved', label: 'Saved', disabled: true });
    for (const id of savedIds) options.push({ id, label: id });
  }
  if (!options.some((o) => o.id === activeId)) {
    options.push({ id: '__h_unsaved', label: 'Unsaved', disabled: true });
    options.push({ id: activeId, label: `${name} (unsaved)` });
  }

  return (
    <div className="mz-fontbar mz-pagebar" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <MoritzSelect
        value={activeId}
        options={options.map((o) => ({
          value: o.id,
          label: o.label,
          disabled: o.disabled,
        }))}
        onChange={onLoad}
        title="Switch page"
        style={{ minWidth: 140 }}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '4px 6px', width: 120 }}
        placeholder="Page name"
      />
      <button className="mz-btn--warn" onClick={onSave} aria-label="Save" title="Save the active page (image + blocks).">
        <MoritzLabel text="Save" size={12} />
      </button>
      <button
        className="mz-btn--warn"
        onClick={onDeleteCurrent}
        disabled={!savedIds.includes(activeId)}
        aria-label="Delete"
      >
        <MoritzLabel text="Delete" size={12} />
      </button>
      <button onClick={onExport} aria-label="Export" title="Download a .page.moritz.json file.">
        <MoritzLabel text="Export" size={12} />
      </button>
      <button onClick={() => fileInput.current?.click()} aria-label="Import" title="Load a .page.moritz.json file.">
        <MoritzLabel text="Import" size={12} />
      </button>
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
