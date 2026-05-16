import { useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import {
  effectiveStyle,
  fontWithOverrides,
  useAppStore,
} from '../../state/store.js';
import { textPresetSets } from '../../data/textPresets.js';
import {
  presetKey,
  useTextPresetsStore,
} from '../../state/textPresetsStore.js';
import { Section, Slider, StyleControls } from './StyleControls.js';
import { Workspace } from '../../ui/canvas/Workspace.js';
import type { CameraSnapshot } from '../../ui/canvas/useCanvasInput.js';
import { MoritzLabel } from '../../ui/MoritzText.js';
import { MoritzSelect } from '../../ui/MoritzSelect.js';
import { MgLeftBar, MgRightBar } from '@christof/magdalena/react';

// Tiny shared store so the Stage and the Outliner (now separate
// components hosted in different windows) can share the debug-overlay
// toggle without lifting it into the global app store.
const useStyleSetterUiStore = create<{
  debugOverlay: boolean;
  setDebugOverlay: (v: boolean) => void;
}>((set) => ({
  debugOverlay: false,
  setDebugOverlay: (debugOverlay) => set({ debugOverlay }),
}));

/**
 * StyleSetter — sliders bound to the active `style` slice in the store.
 * The active style is the universal font-agnostic shape/material; it is
 * loaded either from the font's bundled baseline or from a separately
 * loaded Style file. Same panel is mirrored in GlyphSetter and TypeSetter
 * so the controls live in the same screen position across modules.
 */
export function StyleSetter(): JSX.Element {
  return (
    <>
      <StyleSetterStage />
      <MgLeftBar
        id="moritz.outliner"
        title="Style"
      >
        <StyleSetterOutliner />
      </MgLeftBar>
      <MgRightBar
        id="moritz.attrs"
        title="Attributes"
      >
        <StyleSetterAttrs />
      </MgRightBar>
    </>
  );
}

export function StyleSetterStage(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const style = useAppStore((s) => s.style);
  const text = useAppStore((s) => s.text);
  const textScale = useAppStore((s) => s.textScale);
  const setKerning = useAppStore((s) => s.setKerning);
  const setModule = useAppStore((s) => s.setModule);
  const setGlyphsetterTab = useAppStore((s) => s.setGlyphsetterTab);
  const setKerningFocusPair = useAppStore((s) => s.setKerningFocusPair);
  const debugOverlay = useStyleSetterUiStore((s) => s.debugOverlay);

  const rendered = useMemo(() => {
    const merged = fontWithOverrides(font, style);
    const result = layout(text, merged);
    const raw = renderLayoutToSvg(result, merged, {
      padding: 30,
      scale: textScale,
      debugOverlay,
    });
    const m = raw.match(
      /^<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*)<\/svg>\s*$/,
    );
    if (!m) return { inner: '', w: 0, h: 0 };
    return { inner: m[3] ?? '', w: parseFloat(m[1] ?? '0'), h: parseFloat(m[2] ?? '0') };
  }, [text, font, style, textScale, debugOverlay]);

  const [camera, setCameraState] = useState<CameraSnapshot>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const setCamera = (patch: Partial<CameraSnapshot>) =>
    setCameraState((c) => ({ ...c, ...patch }));
  const userTouched = useRef(false);
  const lastFit = useRef<string>('');
  const onFit = (cw: number, ch: number) => {
    const key = `${rendered.w}x${rendered.h}@${cw}x${ch}`;
    if (userTouched.current || lastFit.current === key) return;
    if (rendered.w === 0 || rendered.h === 0 || cw === 0 || ch === 0) return;
    lastFit.current = key;
    setCameraState({
      zoom: 1,
      panX: (cw - rendered.w) / 2,
      panY: (ch - rendered.h) / 2,
    });
  };
  const trackCamera = (patch: Partial<CameraSnapshot>) => {
    userTouched.current = true;
    setCamera(patch);
  };

  return (
    <div
      className="mz-stylesetter mz-stylesetter--sift"
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        className="mz-stylesetter__bench"
        style={{ position: 'absolute', inset: 0 }}
      >
        <Workspace
          camera={camera}
          setCamera={trackCamera}
          panMode="both"
          className="mz-canvas mz-stylesetter__preview"
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          {({ width, height }) => {
            onFit(width, height);
            return (
              <g
                onClick={(e) => {
                  const target = e.target as Element | null;
                  if (!target) return;
                  const editHit = target.closest('[data-action="edit-kern"]');
                  if (editHit) {
                    const pair = editHit.getAttribute('data-pair');
                    if (!pair) return;
                    setModule('glyphsetter');
                    setGlyphsetterTab('kerning');
                    setKerningFocusPair(pair);
                    return;
                  }
                  const hit = target.closest('[data-action="add-kern"]');
                  if (!hit) return;
                  const pair = hit.getAttribute('data-pair');
                  if (!pair || pair.length === 0) return;
                  if (font.kerning?.[pair] !== undefined) return;
                  setKerning({ ...(font.kerning ?? {}), [pair]: 0 });
                  setModule('glyphsetter');
                  setGlyphsetterTab('kerning');
                  setKerningFocusPair(pair);
                }}
                transform={`translate(${camera.panX} ${camera.panY}) scale(${camera.zoom})`}
                dangerouslySetInnerHTML={{ __html: rendered.inner }}
              />
            );
          }}
        </Workspace>
      </div>
    </div>
  );
}

export function StyleSetterOutliner(): JSX.Element {
  const text = useAppStore((s) => s.text);
  const setText = useAppStore((s) => s.setText);
  const textScale = useAppStore((s) => s.textScale);
  const setTextScale = useAppStore((s) => s.setTextScale);
  const overrides = useTextPresetsStore((s) => s.overrides);
  const activeKey = useTextPresetsStore((s) => s.activeBy.stylesetter ?? null);
  const setActive = useTextPresetsStore((s) => s.setActive);
  const setOverride = useTextPresetsStore((s) => s.setOverride);
  const debugOverlay = useStyleSetterUiStore((s) => s.debugOverlay);
  const setDebugOverlay = useStyleSetterUiStore((s) => s.setDebugOverlay);
  const presetOptions = [
    { value: '', label: 'load preset' },
    ...textPresetSets.flatMap((set) => [
      { value: `set:${set.id}`, label: set.name, disabled: true },
      ...set.bubbles.map((b, i) => {
        const k = presetKey(set.id, i);
        const modified = overrides[k] !== undefined;
        return {
          value: k,
          label: modified ? `${b.label} modified` : b.label,
        };
      }),
    ]),
  ];
  return (
    <>
      <Section title="Preset">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12 }}>
            <MoritzLabel text="Load" size={11} />
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <MoritzSelect
              value={activeKey ?? ''}
              options={presetOptions}
              onChange={(enc) => {
                if (!enc) {
                  setActive('stylesetter', null);
                  return;
                }
                const [setId, idxStr] = enc.split('::');
                const set = textPresetSets.find((s) => s.id === setId);
                const idx = Number(idxStr);
                const orig = set?.bubbles[idx]?.text;
                if (orig === undefined) return;
                setActive('stylesetter', enc);
                setText(overrides[enc] ?? orig);
              }}
              style={{ padding: 4, flex: 1 }}
            />
            <button
              className="mz-btn--warn"
              onClick={() => {
                if (activeKey) setOverride(activeKey, text);
              }}
              disabled={!activeKey}
              title={activeKey ? 'Overwrite this preset with the current text' : 'Load a preset first to overwrite it'}
              aria-label="Save preset"
              style={{ padding: '2px 8px' }}
            >
              <MoritzLabel text="Save" size={12} />
            </button>
          </div>
        </label>
      </Section>

      <Section title="Content">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          style={{
            width: '100%',
            fontSize: 14,
            padding: 8,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </Section>

      <Section title="Preview">
        <Slider
          label="Scale"
          min={0.2}
          max={3}
          step={0.05}
          value={textScale}
          onChange={setTextScale}
          tooltip="Visual zoom for the preview only. Doesn't affect exported font units."
        />
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          title="Overlay each glyph's advance box, side-bearing ticks, and kerning offsets between adjacent glyphs. Preview-only — never written to exports."
        >
          <input
            type="checkbox"
            checked={debugOverlay}
            onChange={(e) => setDebugOverlay(e.target.checked)}
          />
          <MoritzLabel text="Glyph debug overlay" size={11} />
        </label>
      </Section>
    </>
  );
}

export function StyleSetterAttrs(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyleOverride);
  const eff = useMemo(() => effectiveStyle(font, style), [font, style]);
  const original = useAppStore((s) => s.loadedStyleSettings);
  return (
    <div className="mz-mod--stylesetter">
      <StyleControls
        style={eff}
        setStyle={setStyle}
        {...(original ? { original } : {})}
      />
    </div>
  );
}
