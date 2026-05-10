/**
 * Dev settings & debug-mode importance popover.
 *
 * - <DevSettingsWindow> — floating window with knobs for warmth /
 *   contrast / saturation, the layout grid, debug toggle, and a full
 *   JSON export / import of the Sift state. Toggleable via the workbench.
 * - <ImportanceDebugLayer> — when debug mode is on, right-click on any
 *   element marked `.sf-imp-target` (Imp wrapper with an id) opens a
 *   popover that lets you raise / lower the importance level.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useSift } from './SiftRoot.js';
import { FloatingWindow } from './FloatingWindow.js';
import { Slider, Button, Checkbox } from './inputs.js';
import { Attrs, AttrSection, AttrRow } from './Attrs.js';
import { DEFAULT_THEME } from './tokens.js';
import { DEFAULT_LAYOUT } from './layout.js';

export function DevSettingsWindow(props: {
  onClose?: () => void;
}): JSX.Element {
  const {
    theme,
    setTheme,
    layout,
    setLayout,
    resetLayout,
    debug,
    setDebug,
    importance,
    setImportance,
  } = useSift();

  // Full snapshot of every Sift-level knob. Anything the design system
  // owns goes here so a user can save / share / restore the entire UI
  // state with one JSON blob.
  const snapshot = useMemo(
    () => ({
      $schema: 'sift.settings.v1',
      theme,
      layout,
      debug,
      importance,
    }),
    [theme, layout, debug, importance],
  );
  const json = useMemo(() => JSON.stringify(snapshot, null, 2), [snapshot]);

  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyImport = (raw: string): void => {
    try {
      const parsed = JSON.parse(raw) as {
        theme?: typeof theme;
        layout?: typeof layout;
        debug?: boolean;
        importance?: Record<string, number>;
      };
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.layout) setLayout(parsed.layout);
      if (typeof parsed.debug === 'boolean') setDebug(parsed.debug);
      if (parsed.importance) {
        // Replace the whole map: clear any keys not in the import.
        const incoming = parsed.importance;
        for (const k of Object.keys(importance)) {
          if (!(k in incoming)) setImportance(k, null);
        }
        for (const [k, v] of Object.entries(incoming)) {
          setImportance(k, v);
        }
      }
      setImportError(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const downloadJson = (): void => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sift-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = (): void => {
    void navigator.clipboard?.writeText(json);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const txt = typeof r.result === 'string' ? r.result : '';
      setImportText(txt);
      applyImport(txt);
    };
    r.readAsText(f);
    e.target.value = '';
  };

  return (
    <FloatingWindow
      id="sf-dev-settings"
      title="Sift · dev settings"
      initial={{ x: window.innerWidth - 360, y: 24, w: 340, h: 560 }}
      headerExtra={
        props.onClose && (
          <Button imp={0} onClick={props.onClose}>
            ×
          </Button>
        )
      }
    >
      <Attrs>
        <AttrSection title="Theme" imp={2}>
          <AttrRow label="Warmth">
            <Slider
              value={theme.warmth}
              onChange={(v) => setTheme({ warmth: v })}
              min={0}
              max={1}
              step={0.005}
            />
          </AttrRow>
          <AttrRow label="Contrast">
            <Slider
              value={theme.contrast}
              onChange={(v) => setTheme({ contrast: v })}
              min={0}
              max={1.5}
              step={0.01}
            />
          </AttrRow>
          <AttrRow label="Saturation">
            <Slider
              value={theme.saturation}
              onChange={(v) => setTheme({ saturation: v })}
              min={0}
              max={1.5}
              step={0.01}
            />
          </AttrRow>
          <AttrRow label="Quick">
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Button onClick={() => setTheme({ warmth: 0.05 })}>night</Button>
              <Button onClick={() => setTheme({ warmth: 0.5 })}>dusk</Button>
              <Button onClick={() => setTheme({ warmth: 0.95 })}>day</Button>
            </span>
          </AttrRow>
          <AttrRow label="Reset">
            <Button onClick={() => setTheme(DEFAULT_THEME)}>defaults</Button>
          </AttrRow>
        </AttrSection>
        <AttrSection title="Layout" imp={2}>
          <AttrRow label="Pad">
            <Slider
              value={layout.pad}
              onChange={(v) => setLayout({ pad: Math.round(v) })}
              min={0}
              max={32}
              step={1}
            />
          </AttrRow>
          <AttrRow label="Gap">
            <Slider
              value={layout.gap}
              onChange={(v) => setLayout({ gap: Math.round(v) })}
              min={0}
              max={32}
              step={1}
            />
          </AttrRow>
          <AttrRow label="Toolbar h">
            <Slider
              value={layout.toolbarH}
              onChange={(v) => setLayout({ toolbarH: Math.round(v) })}
              min={48}
              max={240}
              step={1}
            />
          </AttrRow>
          <AttrRow label="Side w">
            <Slider
              value={layout.sideW}
              onChange={(v) => setLayout({ sideW: Math.round(v) })}
              min={180}
              max={480}
              step={1}
            />
          </AttrRow>
          <AttrRow label="Reset">
            <Button onClick={resetLayout}>defaults</Button>
          </AttrRow>
        </AttrSection>
        <AttrSection title="Mode" imp={1}>
          <AttrRow label="Debug">
            <Checkbox value={debug} onChange={setDebug} />
          </AttrRow>
          <AttrRow label="Importance">
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: 'var(--sf-text-faint)' }}>
                {Object.keys(importance).length} override
                {Object.keys(importance).length === 1 ? '' : 's'}
              </span>
              <Button
                tone="warn"
                disabled={Object.keys(importance).length === 0}
                onClick={() => {
                  for (const k of Object.keys(importance)) {
                    setImportance(k, null);
                  }
                }}
              >
                clear all
              </Button>
            </span>
          </AttrRow>
        </AttrSection>
        <AttrSection title="Settings JSON" imp={2}>
          <AttrRow label="Export">
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Button onClick={copyJson}>copy</Button>
              <Button onClick={downloadJson}>download</Button>
            </span>
          </AttrRow>
          <AttrRow label="Snapshot">
            <textarea
              readOnly
              value={json}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 120,
                fontFamily:
                  'ui-monospace, Menlo, Consolas, monospace',
                fontSize: 11,
                background: 'var(--sf-surface-1, var(--mz-bg))',
                color: 'var(--sf-text)',
                border: '1px solid var(--sf-line)',
                borderRadius: 3,
                padding: 4,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </AttrRow>
          <AttrRow label="Import">
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Button
                onClick={() => {
                  void navigator.clipboard?.readText().then((t) => {
                    setImportText(t);
                    applyImport(t);
                  });
                }}
              >
                paste
              </Button>
              <Button onClick={() => fileRef.current?.click()}>file…</Button>
              <Button
                tone="warn"
                onClick={() => {
                  setTheme(DEFAULT_THEME);
                  setLayout(DEFAULT_LAYOUT);
                  setDebug(false);
                  for (const k of Object.keys(importance)) {
                    setImportance(k, null);
                  }
                  setImportText('');
                  setImportError(null);
                }}
              >
                reset all
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onPickFile}
                style={{ display: 'none' }}
              />
            </span>
          </AttrRow>
          <AttrRow label="Paste">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              onBlur={() => {
                if (importText.trim()) applyImport(importText);
              }}
              placeholder="Paste JSON here…"
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 80,
                fontFamily:
                  'ui-monospace, Menlo, Consolas, monospace',
                fontSize: 11,
                background: 'var(--sf-surface-1, var(--mz-bg))',
                color: 'var(--sf-text)',
                border: `1px solid ${importError ? 'var(--sf-accent-warn)' : 'var(--sf-line)'}`,
                borderRadius: 3,
                padding: 4,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </AttrRow>
          {importError && (
            <AttrRow label="">
              <span style={{ color: 'var(--sf-accent-warn)', fontSize: 11 }}>
                {importError}
              </span>
            </AttrRow>
          )}
        </AttrSection>
      </Attrs>
    </FloatingWindow>
  );
}

// ---------- Importance debug layer ----------------------------------------

type Pop = { id: string; x: number; y: number };

export function ImportanceDebugLayer(): JSX.Element | null {
  const { debug, importance, setImportance } = useSift();
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(() => {
    if (!debug) {
      setPop(null);
      return;
    }
    const onCtx = (e: MouseEvent) => {
      const tgt = (e.target as Element | null)?.closest(
        '[data-sf-imp-id]',
      ) as HTMLElement | null;
      if (!tgt) return;
      const id = tgt.getAttribute('data-sf-imp-id');
      if (!id) return;
      e.preventDefault();
      setPop({ id, x: e.clientX, y: e.clientY });
    };
    const onClick = (e: MouseEvent) => {
      if (!pop) return;
      const tgt = e.target as Element | null;
      if (tgt?.closest('.sf-pop')) return;
      setPop(null);
    };
    document.addEventListener('contextmenu', onCtx);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('mousedown', onClick);
    };
  }, [debug, pop]);

  if (!debug || !pop) return null;
  const cur = importance[pop.id] ?? 1;
  const style: CSSProperties = {
    left: Math.min(window.innerWidth - 200, pop.x),
    top: Math.min(window.innerHeight - 200, pop.y),
  };
  return (
    <div className="sf-pop" style={style}>
      <div data-imp={2}>Importance · {pop.id}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map((lvl) => (
          <Button
            key={lvl}
            tone={lvl === cur ? 'hot' : 'default'}
            variant={lvl === cur ? 'solid' : 'ghost'}
            onClick={() => {
              setImportance(pop.id, lvl);
              setPop(null);
            }}
          >
            {lvl}
          </Button>
        ))}
      </div>
      <Button
        tone="warn"
        onClick={() => {
          setImportance(pop.id, null);
          setPop(null);
        }}
      >
        reset
      </Button>
    </div>
  );
}
