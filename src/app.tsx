import { GlyphSetter } from './modules/glyphsetter/GlyphSetter.js';
import { BubbleSetter } from './modules/bubblesetter/BubbleSetter';
import { StyleSetter } from './modules/stylesetter/StyleSetter.js';
import { TypeSetter } from './modules/typesetter/TypeSetter.js';
import { useAppStore, type ModuleId } from './state/store.js';
import { FontBar } from './ui/FontBar.js';
import { BubbleBar } from './ui/BubbleBar.js';
import { StyleBar } from './ui/StyleBar.js';
import { PageBar } from './ui/PageBar.js';
import { MoritzLabel } from './ui/MoritzText.js';
import { MgModuleSwitcher, MgWorkbench, MgViewportLayer, MgTopBar } from '@christof/magdalena/react';

const tabs: { id: ModuleId; label: JSX.Element; title: string }[] = [
  { id: 'glyphsetter', label: <MoritzLabel text="Glyph" size={13} />, title: 'Glyph' },
  { id: 'bubblesetter', label: <MoritzLabel text="Bubble" size={13} />, title: 'Bubble' },
  { id: 'stylesetter', label: <MoritzLabel text="Style" size={13} />, title: 'Style' },
  { id: 'typesetter', label: <MoritzLabel text="Type" size={13} />, title: 'Type' },
];

export function App(): JSX.Element {
  return <AppShell />;
}

function AppShell(): JSX.Element {
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const editorScale = useAppStore((s) => s.glyphView.editorScale);
  const setGlyphView = useAppStore((s) => s.setGlyphView);

  return (
    <MgWorkbench>
      <MgViewportLayer>
        <div
          className={`mz-app mz-mod--${module} mz-app--mg`}
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
                  gap: 'var(--mg-gap)',
                }}
              >
                <MgModuleSwitcher
                  id="moritz.modules"
                  modules={tabs}
                  activeModuleId={module}
                  onModuleChange={setModule}
                  importance={1}
                  label="Moritz modules"
                />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'calc(var(--mg-pad) * 0.5)',
                    paddingTop: 'calc(var(--mg-pad) * 0.5)',
                    borderTop: '1px solid var(--mg-line)',
                  }}
                >
                  {module === 'glyphsetter' && (
                    <>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: 'var(--mg-text-muted)',
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
              </div>
            </MgTopBar>
    </MgWorkbench>
  );
}
