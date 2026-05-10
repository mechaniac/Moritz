import { useEffect, useState } from 'react';
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
import { Icon } from './ui/Icon.js';
import {
  SiftRoot,
  Workbench,
  FloatingWindow,
  Button,
  Slider,
  DevSettingsWindow,
  ImportanceDebugLayer,
  Imp,
  useSiftLayout,
  dockToolbar,
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
  const layout = useSiftLayout();

  const [showDev, setShowDev] = useState(false);

  return (
    <Workbench
        stage={
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
        }
        windows={
          <>
            <FloatingWindow
              id="moritz-toolbar"
              title={
                <Imp id="moritz.title" level={3}>
                  Moritz
                </Imp>
              }
              mod={module}
              initial={{ x: 16, y: 16, w: 320, h: 320 }}
              dock={dockToolbar(layout)}
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
                      <Button
                        key={t.id}
                        type="button"
                        tone={active ? 'hot' : 'default'}
                        variant={active ? 'solid' : 'ghost'}
                        imp={active ? 2 : 1}
                        className={`mz-mod--${t.id}`}
                        onClick={() => setModule(t.id)}
                      >
                        {t.label}
                      </Button>
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
                        Zoom
                        <Slider
                          min={1}
                          max={30}
                          step={0.5}
                          value={editorScale}
                          onChange={(value) =>
                            setGlyphView({
                              editorScale: value,
                            })
                          }
                          className="mz-shell__zoom-slider"
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
                  <Button
                    type="button"
                    variant="ghost"
                    imp={0}
                    title="Dev settings"
                    onClick={() => setShowDev((v) => !v)}
                  >
                    <Icon name="settings" size={16} />
                  </Button>
                  <Button onClick={openSettings} imp={0}>
                    legacy theme…
                  </Button>
                </div>
              </div>
            </FloatingWindow>
            {showDev && <DevSettingsWindow onClose={() => setShowDev(false)} />}
          </>
        }
        overlays={<ImportanceDebugLayer />}
      />
  );
}
