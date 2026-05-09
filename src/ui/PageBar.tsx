import { useEffect, useRef, useState } from 'react';
import {
  deletePage,
  exportPageJson,
  importPageJson,
  listPageIds,
  loadPage,
  savePage,
} from '../state/pagePersistence.js';
import { downloadBlob } from '../state/persistence.js';
import { useTypesetterStore } from '../state/typesetterStore.js';
import type { Page, TextBlockData } from '../core/types.js';

/**
 * Save / load / import / export the active Page (the TypeSetter scene).
 * Mirrors `FontBar` and `StyleBar`. Pages may include a large background
 * image as a data URL; localStorage has a per-origin quota of ~5MB so
 * very large pages may need round-tripping via Export/Import for now.
 */
export function PageBar(): JSX.Element {
  const pageImage = useTypesetterStore((s) => s.pageImage);
  const pageW = useTypesetterStore((s) => s.pageW);
  const pageH = useTypesetterStore((s) => s.pageH);
  const blocks = useTypesetterStore((s) => s.blocks);
  const setPage = useTypesetterStore((s) => s.setPage);
  const replaceBlocks = useTypesetterStore((s) => s.replaceBlocks);
  const [savedIds, setSavedIds] = useState<string[]>(() => listPageIds());
  const [activeId, setActiveId] = useState<string>('untitled');
  const [name, setName] = useState<string>('Untitled');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSavedIds(listPageIds());
  }, []);

  const buildPage = (): Page => ({
    id: sanitizeId(name),
    name,
    pageW,
    pageH,
    ...(pageImage ? { background: pageImage } : {}),
    blocks: blocks.map((b): TextBlockData => ({
      id: b.id,
      x: b.x,
      y: b.y,
      fontSize: b.fontSize,
      text: b.text,
      bold: b.bold,
      italic: b.italic,
      shape: typeof b.shape === 'string' ? b.shape : 'none',
      bubbleW: b.bubbleW,
      bubbleH: b.bubbleH,
      tailX: b.tailX,
      tailY: b.tailY,
      bubbleStroke: b.bubbleStroke,
      ...(b.align ? { align: b.align } : {}),
    })),
  });

  const onSave = () => {
    const p = buildPage();
    try {
      savePage(p);
      setSavedIds(listPageIds());
      setActiveId(p.id);
    } catch {
      alert('Saving page to browser storage failed (likely too large — use Export instead).');
    }
  };
  const applyPage = (p: Page) => {
    setPage(p.background ?? '', p.pageW, p.pageH);
    replaceBlocks(
      p.blocks.map((b) => ({
        ...b,
        // The TextBlock `shape` runtime type is BubbleShape (a string in
        // practice for built-in shapes); we trust the persisted string.
        shape: b.shape as unknown as import('../core/bubble.js').BubbleShape,
      })),
    );
    setActiveId(p.id);
    setName(p.name);
  };
  const onLoad = (id: string) => {
    if (!id) return;
    const p = loadPage(id);
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
    const json = exportPageJson(buildPage());
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`${sanitizeId(name)}-${stamp}.page.moritz.json`, json, 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const p = importPageJson(text);
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
