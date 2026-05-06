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
  const setFont = useAppStore.setState;
  const [savedIds, setSavedIds] = useState<string[]>(() => listFontIds());
  const [name, setName] = useState(font.name);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(font.name), [font.id, font.name]);

  const builtIn = isBuiltInId(font.id);

  const onSave = () => {
    // For a built-in font we keep its id stable so the next reload
    // (and the Built-in dropdown) picks up the override automatically.
    // For user fonts, the id is derived from the typed name as before.
    const id = builtIn ? font.id : sanitizeId(name);
    const toSave = { ...font, id, name };
    saveFont(toSave, view);
    setSavedIds(listFontIds());
    setFont({ font: toSave });
  };
  const onResetBuiltIn = () => {
    if (!builtIn) return;
    if (!confirm(`Discard saved changes to "${font.name}" and reload the original?`)) return;
    const original = resetBuiltInFont(font.id);
    setSavedIds(listFontIds());
    if (original) setFont({ font: original });
  };
  const onLoad = (id: string) => {
    const env = loadFontEnvelope(id);
    if (!env) return;
    setFont(env.view ? { font: env.font, glyphView: env.view } : { font: env.font });
  };
  const onDelete = (id: string) => {
    deleteFont(id);
    setSavedIds(listFontIds());
  };
  const onExport = () => {
    downloadBlob(`${font.id}.moritz.json`, exportFontJson(font, view), 'application/json');
  };
  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const env = importFontJson(text);
      setFont(env.view ? { font: env.font, glyphView: env.view } : { font: env.font });
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
          if (f) setFont(f.view ? { font: f.font, glyphView: f.view } : { font: f.font });
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
      <button
        className="mz-fontbar__save"
        onClick={onSave}
        title={
          builtIn
            ? `Overwrite the built-in "${font.name}" with your edits (stored locally; original is always recoverable via Reset).`
            : 'Save the current font under the typed name.'
        }
      >
        {builtIn ? 'Save (overwrite built-in)' : 'Save'}
      </button>
      {builtIn && savedIds.includes(font.id) && (
        <button
          className="mz-fontbar__reset"
          onClick={onResetBuiltIn}
          title="Discard saved changes and reload the bundled original."
        >
          Reset
        </button>
      )}
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
