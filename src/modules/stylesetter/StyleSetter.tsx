import { useMemo, useState } from 'react';
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

/**
 * StyleSetter — sliders bound to the active `style` slice in the store.
 * The active style is the universal font-agnostic shape/material; it is
 * loaded either from the font's bundled baseline or from a separately
 * loaded Style file. Same panel is mirrored in GlyphSetter and TypeSetter
 * so the controls live in the same screen position across modules.
 */
export function StyleSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const style = useAppStore((s) => s.style);
  const text = useAppStore((s) => s.text);
  const textScale = useAppStore((s) => s.textScale);
  const setStyle = useAppStore((s) => s.setStyleOverride);
  const setText = useAppStore((s) => s.setText);
  const setTextScale = useAppStore((s) => s.setTextScale);
  const overrides = useTextPresetsStore((s) => s.overrides);
  const activeKey = useTextPresetsStore((s) => s.activeBy.stylesetter ?? null);
  const setActive = useTextPresetsStore((s) => s.setActive);
  const setOverride = useTextPresetsStore((s) => s.setOverride);
  const setKerning = useAppStore((s) => s.setKerning);
  const setModule = useAppStore((s) => s.setModule);
  const setGlyphsetterTab = useAppStore((s) => s.setGlyphsetterTab);
  const setKerningFocusPair = useAppStore((s) => s.setKerningFocusPair);

  // Glyph-box / kerning debug overlay. Local to the StyleSetter view —
  // it's a viewing aid, not a style property, and never affects exports.
  const [debugOverlay, setDebugOverlay] = useState(false);

  // The active style IS the effective style now — no merge step needed.
  // Kept the local alias to minimise churn at call sites below.
  const eff = useMemo(
    () => effectiveStyle(font, style),
    [font, style],
  );

  // Click delegation for the "+K" badges injected by `renderLayoutToSvg`.
  // The SVG is rendered via `dangerouslySetInnerHTML`, so we listen on
  // the wrapping React element and walk up to find the `data-pair`
  // marker. On hit: write a zero-delta kerning entry, switch to the
  // GlyphSetter, and ask the kerning panel to scroll/highlight it.
  const handleSvgClick = (e: React.MouseEvent<HTMLDivElement>): void => {
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
  };

  const svg = useMemo(() => {
    const merged = fontWithOverrides(font, style);
    const result = layout(text, merged);
    return renderLayoutToSvg(result, merged, {
      padding: 30,
      scale: textScale,
      debugOverlay,
    });
  }, [text, font, style, textScale, debugOverlay]);

  // Baseline for the per-slider "modified" markers. This is whatever was
  // most recently loaded — the font's bundled style on font load, or a
  // separately loaded Style file's settings. Drift from this baseline
  // paints the slider red.
  const original = useAppStore((s) => s.loadedStyleSettings);

  return (
    <div className="mz-workbench mz-stylesetter">
      {/* Left drawer — text source: preset, content, preview controls */}
      <div className="mz-workbench__drawer mz-workbench__drawer--left">
        <div className="mz-workbench__drawer-body">
          <Section title="Preset">
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>Load</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <select
                  value={activeKey ?? ''}
                  onChange={(e) => {
                    const enc = e.target.value;
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
                >
                  <option value="">— load preset —</option>
                  {textPresetSets.map((set) => (
                    <optgroup key={set.id} label={set.name}>
                      {set.bubbles.map((b, i) => {
                        const k = presetKey(set.id, i);
                        const modified = overrides[k] !== undefined;
                        return (
                          <option key={k} value={k}>
                            {b.label}{modified ? ' •' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                <button
                  className="mz-btn--warn"
                  onClick={() => {
                    if (activeKey) setOverride(activeKey, text);
                  }}
                  disabled={!activeKey}
                  title={activeKey ? 'Overwrite this preset with the current text' : 'Load a preset first to overwrite it'}
                  style={{ padding: '2px 8px' }}
                >
                  Save
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
              Glyph debug overlay
            </label>
          </Section>
        </div>
      </div>

      {/* Bench — paper-white preview surface on the shared workspace raster */}
      <div className="mz-workbench__bench mz-stylesetter__bench">
        <div
          className="mz-canvas mz-stylesetter__preview"
          onClick={handleSvgClick}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Right drawer — style controls (identical position across modules) */}
      <div className="mz-workbench__drawer mz-workbench__drawer--right mz-mod--stylesetter">
        <div className="mz-workbench__drawer-body">
          <StyleControls
            style={eff}
            setStyle={setStyle}
            {...(original ? { original } : {})}
          />
        </div>
      </div>
    </div>
  );
}
