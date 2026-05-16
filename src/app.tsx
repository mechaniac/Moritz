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
import { MoritzLabel } from './ui/MoritzText.js';
import { MgButton, MgWorkbench, MgViewportLayer, MgTopBar } from '@christof/magdalena/react';
import {
  SiftRoot,
  ImportanceDebugLayer,
} from './sift/index.js';

const tabs: { id: ModuleId; label: string }[] = [
  { id: 'glyphsetter', label: 'Glyph' },
  { id: 'bubblesetter', label: 'Bubble' },
  { id: 'stylesetter', label: 'Style' },
  { id: 'typesetter', label: 'Type' },
];

export function App(): JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  // Keep the legacy Moritz scheme on <html> so existing module-internal
  // styles still resolve while we port them to Sift.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <SiftRoot>
      <AppShell />
    </SiftRoot>
  );
}

function AppShell(): JSX.Element {
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const editorScale = useAppStore((s) => s.glyphView.editorScale);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  const openSettings = useThemeStore((s) => s.openSettings);

  return (
    <MgWorkbench>
      <MgViewportLayer>
        <div
          className={`mz-app mz-mod--${module} mz-app--sift`}
          style={{ width: '100%', height: '100%' }}
        >
          <main
            className={`mz-app__main mz-main--${module}`}
            style={{ width: '100%', height: '100%' }}
          >
            {module === 'glyphsetter' && <GlyphSetter />}
            {module === 'bubblesetter' && <BubbleSetter />}
            {module === 'stylesetter' && <StyleSetter />}
            {module === 'typesetter' && <TypeSetter />}
          </main>
          <SettingsModal />
        </div>
      </MgViewportLayer>
      <MgTopBar
        id="moritz-toolbar"
        title="Moritz"
      >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sf-gap)',
                }}
              >
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {tabs.map((t) => {
                    const active = module === t.id;
                    return (
                      <MgButton
                        id={`moritz.module.${t.id}`}
                        key={t.id}
                        type="button"
                        tone={active ? 'relevant' : 'neutral'}
                        importance={active ? 3 : 1}
                        className={`mz-mod--${t.id}`}
                        aria-label={t.label}
                        title={t.label}
                        onClick={() => setModule(t.id)}
                      >
                        <MoritzLabel text={t.label} size={13} />
                      </MgButton>
                    );
                  })}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--sf-pad-tight)',
                    paddingTop: 'var(--sf-pad-tight)',
                    borderTop: '1px solid var(--sf-line)',
                  }}
                >
                  {module === 'glyphsetter' && (
                    <>
                      <label
                        className="sf-attrs__label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <MoritzLabel text="Zoom" size={12} />
                        <input
                          type="range"
                          min={1}
                          max={30}
                          step={0.5}
                          value={editorScale}
                          onChange={(event) =>
                            setGlyphView({
                              editorScale: Number(event.target.value),
                            })
                          }
                          className="mz-shell__zoom-slider"
                          style={{ width: 120 }}
                        />
                      </label>
                      <FontBar />
                    </>
                  )}
                  {module === 'bubblesetter' && <BubbleBar />}
                  {module === 'stylesetter' && <StyleBar />}
                  {module === 'typesetter' && <PageBar />}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    paddingTop: 'var(--sf-pad-tight)',
                    borderTop: '1px solid var(--sf-line)',
                    alignItems: 'center',
                  }}
                >
                  <MgButton
                    id="moritz.toolbar.legacyTheme"
                    onClick={openSettings}
                    importance={0}
                    aria-label="legacy theme"
                    title="legacy theme"
                  >
                    <MoritzLabel text="legacy theme" size={12} />
                  </MgButton>
                </div>
              </div>
            </MgTopBar>
      <ImportanceDebugLayer />
    </MgWorkbench>
  );
}
