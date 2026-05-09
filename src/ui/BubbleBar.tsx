import { useEffect, useRef, useState } from 'react';
import {
  deleteBubbleFont,
  exportBubbleFontJson,
  importBubbleFontJson,
  listBubbleFontIds,
  loadBubbleFontEnvelope,
  saveBubbleFont,
  writeBubbleFontFile,
} from '../state/bubblePersistence.js';
import { downloadBlob } from '../state/persistence.js';
import { useBubbleStore } from '../state/bubbleStore.js';
import {
  builtInBubbleFonts,
  getBuiltInBubbleFont,
  isBuiltInBubbleId,
  resetBuiltInBubbleFont,
} from '../data/builtInBubbleFonts.js';

/**
 * Save / load / import / export the active bubble font (and the editor
 * view settings captured alongside it). Direct port of `FontBar.tsx`,
 * scoped to `BubbleFont` via `bubblePersistence` and the bubble store.
 */
export function BubbleBar(): JSX.Element {
  const font = useBubbleStore((s) => s.font);
  const view = useBubbleStore((s) => s.view);
  const loadBubbleFontIntoStore = useBubbleStore((s) => s.loadBubbleFont);
  const setBubbleFont = useBubbleStore.setState;
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    listBubbleFontIds(),
  );
  const [name, setName] = useState(font.name);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(font.name), [font.id, font.name]);

  const builtIn = isBuiltInBubbleId(font.id);
  const hasOverride = savedIds.includes(font.id);
  const canDelete = builtIn ? hasOverride : hasOverride;

  const onSave = (): void => {
    const id = sanitizeId(name);
    const toSave = { ...font, id, name };
    saveBubbleFont(toSave, view);
    setSavedIds(listBubbleFontIds());
    setBubbleFont({ font: toSave });
  };
  const onLoad = (id: string): void => {
    if (!id) return;
    if (isBuiltInBubbleId(id)) {
      const f = getBuiltInBubbleFont(id);
      if (f) loadBubbleFontIntoStore(f.font, f.view);
      return;
    }
    const env = loadBubbleFontEnvelope(id);
    if (!env) return;
    loadBubbleFontIntoStore(env.font, env.view);
  };
  const onDeleteCurrent = (): void => {
    if (!canDelete) return;
    const label = builtIn
      ? `Discard saved changes to "${font.name}" and reload the bundled original?`
      : `Delete saved bubble font "${font.name}"?`;
    if (!confirm(label)) return;
    if (builtIn) {
      const original = resetBuiltInBubbleFont(font.id);
      setSavedIds(listBubbleFontIds());
      if (original) loadBubbleFontIntoStore(original);
    } else {
      deleteBubbleFont(font.id);
      setSavedIds(listBubbleFontIds());
    }
  };
  const onExport = (): void => {
    const json = exportBubbleFontJson(font, view);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `${font.id}-${stamp}.moritz-bubbles.json`,
      json,
      'application/json',
    );
    if (import.meta.env?.DEV) {
      void writeBubbleFontFile(font.id, JSON.stringify(JSON.parse(json), null, 2));
    }
  };
  const onImport = async (file: File): Promise<void> => {
    const text = await file.text();
    try {
      const env = importBubbleFontJson(text);
      loadBubbleFontIntoStore(env.font);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const builtInIdSet = new Set(builtInBubbleFonts.map((f) => f.id));
  const userIds = savedIds.filter((id) => !builtInIdSet.has(id));
  const options: { id: string; label: string; disabled?: boolean }[] = [];
  options.push({ id: '__h_built', label: '— Built-in —', disabled: true });
  for (const f of builtInBubbleFonts) {
    options.push({
      id: f.id,
      label: savedIds.includes(f.id) ? `${f.name} *` : f.name,
    });
  }
  if (userIds.length > 0) {
    options.push({ id: '__h_user', label: '— Saved —', disabled: true });
    for (const id of userIds) options.push({ id, label: id });
  }
  if (!options.some((o) => o.id === font.id)) {
    options.push({ id: '__h_unsaved', label: '— Unsaved —', disabled: true });
    options.push({ id: font.id, label: `${font.name} (unsaved)` });
  }

  return (
    <div
      className="mz-bubblebar"
      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
    >
      <select
        className="mz-bubblebar__pick"
        value={font.id}
        onChange={(e) => onLoad(e.target.value)}
        title="Switch bubble font"
        style={{ minWidth: 180 }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        className={`mz-bubblebar__name${
          name !== font.name ? ' mz-modified-input' : ''
        }`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '4px 6px', width: 140 }}
        placeholder="Bubble-font name"
        title="Saving uses this name's id; matching a built-in id overwrites it (Reset restores the original)."
      />
      <button
        className="mz-bubblebar__save mz-btn--warn"
        onClick={onSave}
        title={
          'Save the current bubble font + view settings.\n' +
          'Stored in browser localStorage (key: moritz.bubbles.<id>).\n' +
          'In dev, also written to src/data/bubbles/<id>.json so it\'s\n' +
          'tracked by git and survives clearing browser storage.'
        }
      >
        Save
      </button>
      <button
        className="mz-bubblebar__delete mz-btn--warn"
        onClick={onDeleteCurrent}
        disabled={!canDelete}
        title={
          builtIn
            ? 'Discard saved changes to this built-in and reload the bundled original.'
            : 'Delete this saved bubble font from browser localStorage. The exported .moritz-bubbles.json file (if any) is left alone.'
        }
      >
        {builtIn ? 'Reset' : 'Delete'}
      </button>
      <button
        className="mz-bubblebar__export"
        onClick={onExport}
        title={
          `Download "${font.id}-<date>.moritz-bubbles.json" to your browser's\n` +
          'Downloads folder. In dev, also writes a copy to\n' +
          `src/data/bubbles/${font.id}.json (the repo's tracked bubble folder).`
        }
      >
        Export
      </button>
      <button
        className="mz-bubblebar__import"
        onClick={() => fileInput.current?.click()}
        title={
          'Load a .moritz-bubbles.json file (previously exported, or one of\n' +
          'the tracked files under src/data/bubbles/).'
        }
      >
        Import
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".moritz-bubbles.json,.json,application/json"
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
