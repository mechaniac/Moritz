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

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
        }}
      >
        <strong style={{ fontSize: 18 }}>Moritz</strong>
        <nav style={{ display: 'flex', gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
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
        <FontBar />
      </header>
      <main style={{ flex: 1, overflow: 'auto' }}>
        {module === 'glyphsetter' && <GlyphSetter />}
        {module === 'stylesetter' && <StyleSetter />}
        {module === 'typesetter' && <TypeSetter />}
      </main>
    </div>
  );
}
