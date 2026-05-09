import { useEffect } from 'react';
import { GlyphSetter } from './modules/glyphsetter/GlyphSetter.js';
import { BubbleSetter } from './modules/bubblesetter/BubbleSetter';
import { StyleSetter } from './modules/stylesetter/StyleSetter.js';
import { TypeSetter } from './modules/typesetter/TypeSetter.js';
import { useAppStore, type ModuleId } from './state/store.js';
import { useThemeStore } from './state/themeStore.js';
import { FontBar } from './ui/FontBar.js';
import { BubbleBar } from './ui/BubbleBar.js';
import { StyleBar } from './ui/StyleBar.js';
import { PageBar } from './ui/PageBar.js';
import { SettingsModal } from './ui/SettingsModal.js';

const tabs: { id: ModuleId; label: string }[] = [
  { id: 'glyphsetter', label: 'GlyphSetter' },
  { id: 'bubblesetter', label: 'BubbleSetter' },
  { id: 'stylesetter', label: 'StyleSetter' },
  { id: 'typesetter', label: 'TypeSetter' },
];

export function App(): JSX.Element {
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const editorScale = useAppStore((s) => s.glyphView.editorScale);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  const theme = useThemeStore((s) => s.theme);
  const openSettings = useThemeStore((s) => s.openSettings);

  // Apply the active scheme to <html> as a data-attribute so the CSS
  // `:root[data-theme="..."]` blocks take effect.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div
      className={`mz-app mz-mod--${module}`}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header className="mz-app__header">
        <strong className="mz-app__title" style={{ fontSize: 18 }}>Moritz</strong>
        <nav className="mz-tabs" style={{ display: 'flex', gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`mz-tab mz-tab--${t.id}${module === t.id ? ' mz-tab--active' : ''}`}
              onClick={() => setModule(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        {module === 'glyphsetter' && (
          <label
            className="mz-header__zoom"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mz-text-mute)' }}
            title="Glyph editor zoom"
          >
            Zoom
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={editorScale}
              onChange={(e) => setGlyphView({ editorScale: parseFloat(e.target.value) })}
              style={{ width: 120 }}
            />
          </label>
        )}
        {module === 'glyphsetter' && <FontBar />}
        {module === 'bubblesetter' && <BubbleBar />}
        {module === 'stylesetter' && <StyleBar />}
        {module === 'typesetter' && <PageBar />}
        <button
          onClick={openSettings}
          title="Settings (colour scheme)"
          style={{ padding: '4px 8px' }}
        >
          ⚙
        </button>
      </header>
      <main className={`mz-app__main mz-main--${module}`}>
        {module === 'glyphsetter' && <GlyphSetter />}
        {module === 'bubblesetter' && <BubbleSetter />}
        {module === 'stylesetter' && <StyleSetter />}
        {module === 'typesetter' && <TypeSetter />}
      </main>
      <SettingsModal />
    </div>
  );
}
