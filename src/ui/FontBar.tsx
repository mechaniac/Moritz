import { useEffect, useRef, useState } from 'react';
import {
  deleteFont,
  downloadBlob,
  exportFontJson,
  importFontJson,
  listFontIds,
  loadFont,
  saveFont,
} from '../state/persistence.js';
import { useAppStore } from '../state/store.js';
import { builtInFonts, getBuiltInFont } from '../data/builtInFonts.js';

/** Save / load / import / export the active font. */
export function FontBar(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const setFont = useAppStore.setState;
  const [savedIds, setSavedIds] = useState<string[]>(() => listFontIds());
  const [name, setName] = useState(font.name);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(font.name), [font.id, font.name]);

  const onSave = () => {
    const id = sanitizeId(name);
    const toSave = { ...font, id, name };
    saveFont(toSave);
    setSavedIds(listFontIds());
    setFont({ font: toSave });
  };
  const onLoad = (id: string) => {
    const f = loadFont(id);
    if (f) setFont({ font: f });
  };
  const onDelete = (id: string) => {
    deleteFont(id);
    setSavedIds(listFontIds());
  };
  const onExport = () => {
    downloadBlob(`${font.id}.moritz.json`, exportFontJson(font), 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const f = importFontJson(text);
      setFont({ font: f });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="mz-fontbar" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className="mz-fontbar__builtin"
        value={builtInFonts.some((f) => f.id === font.id) ? font.id : ''}
        onChange={(e) => {
          const f = getBuiltInFont(e.target.value);
          if (f) setFont({ font: f });
        }}
        title="Switch built-in font"
      >
        <option value="">Built-in…</option>
        {builtInFonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <input
        className="mz-fontbar__name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: '4px 6px', width: 140 }}
        placeholder="Font name"
      />
      <button className="mz-fontbar__save" onClick={onSave}>Save</button>
      <select
        className="mz-fontbar__load"
        value=""
        onChange={(e) => {
          if (e.target.value) onLoad(e.target.value);
          e.target.value = '';
        }}
      >
        <option value="">Load…</option>
        {savedIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {savedIds.length > 0 && (
        <select
          className="mz-fontbar__delete"
          value=""
          onChange={(e) => {
            if (e.target.value && confirm(`Delete ${e.target.value}?`)) {
              onDelete(e.target.value);
            }
            e.target.value = '';
          }}
        >
          <option value="">Delete…</option>
          {savedIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      )}
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
