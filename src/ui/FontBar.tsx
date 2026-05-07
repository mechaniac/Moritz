import { useEffect, useRef, useState } from 'react';
import {
  deleteFont,
  downloadBlob,
  exportFontJson,
  importFontJson,
  listFontIds,
  loadFontEnvelope,
  saveFont,
} from '../state/persistence.js';
import { useAppStore } from '../state/store.js';
import {
  builtInFonts,
  getBuiltInFont,
  isBuiltInId,
  resetBuiltInFont,
} from '../data/builtInFonts.js';

/** Save / load / import / export the active font (and the UI view
 *  settings captured alongside it). */
export function FontBar(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const view = useAppStore((s) => s.glyphView);
  const loadFontIntoStore = useAppStore((s) => s.loadFont);
  const setFont = useAppStore.setState;
  const [savedIds, setSavedIds] = useState<string[]>(() => listFontIds());
  const [name, setName] = useState(font.name);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(font.name), [font.id, font.name]);

  const builtIn = isBuiltInId(font.id);
  const hasOverride = savedIds.includes(font.id);
  const canDelete = builtIn ? hasOverride : hasOverride;

  const onSave = () => {
    // The id is derived from the typed name. If that id matches a
    // built-in, this transparently becomes an override of the built-in
    // (and Delete will offer to reset it). Otherwise it's a user font.
    const id = sanitizeId(name);
    const toSave = { ...font, id, name };
    saveFont(toSave, view);
    setSavedIds(listFontIds());
    setFont({ font: toSave });
  };
  const onLoad = (id: string) => {
    if (!id) return;
    if (isBuiltInId(id)) {
      const f = getBuiltInFont(id);
      if (f) loadFontIntoStore(f.font, f.view);
      return;
    }
    const env = loadFontEnvelope(id);
    if (!env) return;
    loadFontIntoStore(env.font, env.view);
  };
  const onDeleteCurrent = () => {
    if (!canDelete) return;
    const label = builtIn
      ? `Discard saved changes to "${font.name}" and reload the bundled original?`
      : `Delete saved font "${font.name}"?`;
    if (!confirm(label)) return;
    if (builtIn) {
      const original = resetBuiltInFont(font.id);
      setSavedIds(listFontIds());
      if (original) loadFontIntoStore(original);
    } else {
      deleteFont(font.id);
      setSavedIds(listFontIds());
    }
  };
  const onExport = () => {
    downloadBlob(`${font.id}.moritz.json`, exportFontJson(font, view), 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const env = importFontJson(text);
      loadFontIntoStore(env.font, env.view);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Unified picker: built-ins first, then user-saved fonts. A built-in
  // with an override is marked with " *". The current font is always
  // present in the list (added under "Unsaved" if it doesn't exist on
  // disk yet, e.g. a freshly imported font).
  const builtInIdSet = new Set(builtInFonts.map((f) => f.id));
  const userIds = savedIds.filter((id) => !builtInIdSet.has(id));
  const options: { id: string; label: string; disabled?: boolean }[] = [];
  options.push({ id: '__h_built', label: '— Built-in —', disabled: true });
  for (const f of builtInFonts) {
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
    <div className="mz-fontbar" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className="mz-fontbar__pick"
        value={font.id}
        onChange={(e) => onLoad(e.target.value)}
        title="Switch font"
        style={{ minWidth: 180 }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        className={`mz-fontbar__name${name !== font.name ? ' mz-modified-input' : ''}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '4px 6px', width: 140 }}
        placeholder="Font name"
        title="Saving uses this name's id; matching a built-in id overwrites it (Reset restores the original)."
      />
      <button className="mz-fontbar__save" onClick={onSave} title="Save the current font + view settings.">
        Save
      </button>
      <button
        className="mz-fontbar__delete"
        onClick={onDeleteCurrent}
        disabled={!canDelete}
        title={
          builtIn
            ? 'Discard saved changes to this built-in and reload the bundled original.'
            : 'Delete this saved font.'
        }
      >
        {builtIn ? 'Reset' : 'Delete'}
      </button>
      <button className="mz-fontbar__export" onClick={onExport}>Export</button>
      <button className="mz-fontbar__import" onClick={() => fileInput.current?.click()}>Import</button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
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
