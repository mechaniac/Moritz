import { GlyphSetter } from './modules/glyphsetter/GlyphSetter.js';
import { StyleSetter } from './modules/stylesetter/StyleSetter.js';
import { TypeSetter } from './modules/typesetter/TypeSetter.js';
import { useAppStore, type ModuleId } from './state/store.js';
import { FontBar } from './ui/FontBar.js';

const tabs: { id: ModuleId; label: string }[] = [
  { id: 'glyphsetter', label: 'GlyphSetter' },
  { id: 'stylesetter', label: 'StyleSetter' },
  { id: 'typesetter', label: 'TypeSetter' },
];

export function App(): JSX.Element {
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const editorScale = useAppStore((s) => s.glyphView.editorScale);
  const setGlyphView = useAppStore((s) => s.setGlyphView);

  return (
    <div
      className="mz-app"
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        className="mz-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
        }}
      >
        <strong className="mz-app__title" style={{ fontSize: 18 }}>Moritz</strong>
        <nav className="mz-tabs" style={{ display: 'flex', gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`mz-tab mz-tab--${t.id}${module === t.id ? ' mz-tab--active' : ''}`}
              onClick={() => setModule(t.id)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ccc',
                borderRadius: 4,
                background: module === t.id ? '#222' : '#fff',
                color: module === t.id ? '#fff' : '#222',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        {module === 'glyphsetter' && (
          <label
            className="mz-header__zoom"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}
            title="Glyph editor zoom"
          >
            Zoom
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={editorScale}
              onChange={(e) => setGlyphView({ editorScale: parseFloat(e.target.value) })}
              style={{ width: 120 }}
            />
          </label>
        )}
        <FontBar />
      </header>
      <main
        className={`mz-main mz-main--${module}`}
        style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: '#bdbdbd' }}
      >
        {module === 'glyphsetter' && <GlyphSetter />}
        {module === 'stylesetter' && <StyleSetter />}
        {module === 'typesetter' && <TypeSetter />}
      </main>
    </div>
  );
}
