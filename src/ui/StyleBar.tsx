import { useEffect, useRef, useState } from 'react';
import {
  deleteStyle,
  exportStyleJson,
  importStyleJson,
  listStyleIds,
  loadStyle,
  saveStyle,
} from '../state/stylePersistence.js';
import { downloadBlob } from '../state/persistence.js';
import { useAppStore } from '../state/store.js';
import {
  builtInStyles,
  getBuiltInStyle,
  isBuiltInStyleId,
  resetBuiltInStyle,
} from '../data/builtInStyles.js';
import type { Style } from '../core/types.js';

/**
 * Save / load / import / export the active Style.
 *
 * A Style is universal — independent of any particular font. Loading a
 * Style replaces the active `style` slice in the store; the active font's
 * glyph geometry is untouched. Mirrors `FontBar.tsx` for the Font side.
 */
export function StyleBar(): JSX.Element {
  const style = useAppStore((s) => s.style);
  const loadStyleSettings = useAppStore((s) => s.loadStyleSettings);
  const [savedIds, setSavedIds] = useState<string[]>(() => listStyleIds());
  const [activeId, setActiveId] = useState<string>(() => 'default');
  const [name, setName] = useState<string>('Default');
  const fileInput = useRef<HTMLInputElement>(null);

  // Track which Style is currently considered "active" by id. We can't
  // derive it perfectly from the live `style` slice (the user may have
  // tweaked it), so we just remember the last loaded id.
  const builtIn = isBuiltInStyleId(activeId);
  const hasOverride = savedIds.includes(activeId);
  const canDelete = builtIn ? hasOverride : hasOverride;

  useEffect(() => {
    setSavedIds(listStyleIds());
  }, []);

  const onSave = () => {
    const id = sanitizeId(name);
    const toSave: Style = { id, name, settings: style };
    saveStyle(toSave);
    setSavedIds(listStyleIds());
    setActiveId(id);
    // Update the loaded baseline so the modified markers reset.
    loadStyleSettings(style);
  };
  const onLoad = (id: string) => {
    if (!id) return;
    let s: Style | undefined;
    if (isBuiltInStyleId(id)) {
      s = getBuiltInStyle(id);
    } else {
      s = loadStyle(id) ?? undefined;
    }
    if (!s) return;
    loadStyleSettings(s.settings);
    setActiveId(s.id);
    setName(s.name);
  };
  const onDeleteCurrent = () => {
    if (!canDelete) return;
    const label = builtIn
      ? `Discard saved changes to "${name}" and reload the bundled original?`
      : `Delete saved style "${name}"?`;
    if (!confirm(label)) return;
    if (builtIn) {
      const original = resetBuiltInStyle(activeId);
      setSavedIds(listStyleIds());
      if (original) {
        loadStyleSettings(original.settings);
        setName(original.name);
      }
    } else {
      deleteStyle(activeId);
      setSavedIds(listStyleIds());
    }
  };
  const onExport = () => {
    const toSave: Style = { id: sanitizeId(name), name, settings: style };
    const json = exportStyleJson(toSave);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`${toSave.id}-${stamp}.style.moritz.json`, json, 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const s = importStyleJson(text);
      loadStyleSettings(s.settings);
      setActiveId(s.id);
      setName(s.name);
      // Persist into localStorage so it shows up in the picker.
      saveStyle(s);
      setSavedIds(listStyleIds());
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const builtInIdSet = new Set(builtInStyles.map((s) => s.id));
  const userIds = savedIds.filter((id) => !builtInIdSet.has(id));
  const options: { id: string; label: string; disabled?: boolean }[] = [];
  options.push({ id: '__h_built', label: '— Built-in —', disabled: true });
  for (const s of builtInStyles) {
    options.push({
      id: s.id,
      label: savedIds.includes(s.id) ? `${s.name} *` : s.name,
    });
  }
  if (userIds.length > 0) {
    options.push({ id: '__h_user', label: '— Saved —', disabled: true });
    for (const id of userIds) options.push({ id, label: id });
  }
  if (!options.some((o) => o.id === activeId)) {
    options.push({ id: '__h_unsaved', label: '— Unsaved —', disabled: true });
    options.push({ id: activeId, label: `${name} (unsaved)` });
  }

  return (
    <div className="mz-fontbar mz-stylebar" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={activeId}
        onChange={(e) => onLoad(e.target.value)}
        title="Switch style"
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
        placeholder="Style name"
        title="Saving uses this name's id."
      />
      <button className="mz-btn--warn" onClick={onSave} title="Save the active style.">Save</button>
      <button
        className="mz-btn--warn"
        onClick={onDeleteCurrent}
        disabled={!canDelete}
        title={builtIn ? 'Reset this built-in style.' : 'Delete this saved style.'}
      >
        {builtIn ? 'Reset' : 'Delete'}
      </button>
      <button onClick={onExport} title="Download a .style.moritz.json file.">Export</button>
      <button onClick={() => fileInput.current?.click()} title="Load a .style.moritz.json file.">Import</button>
      <input
        ref={fileInput}
        type="file"
        accept=".style.moritz.json,.moritz.json,.json,application/json"
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
