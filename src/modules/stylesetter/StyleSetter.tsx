import { useMemo, useState } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import {
  effectiveStyle,
  fontWithOverrides,
  useAppStore,
} from '../../state/store.js';
import { builtInFonts } from '../../data/builtInFonts.js';
import { Section, Slider, StyleControls } from './StyleControls.js';

/**
 * StyleSetter — sliders bound to a forward-only style overlay
 * (`styleOverrides`). The overlay sits on top of `font.style` and only
 * propagates downstream (TypeSetter); it never reaches back into
 * GlyphSetter, which always renders from the raw `font.style`.
 */
export function StyleSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const styleOverrides = useAppStore((s) => s.styleOverrides);
  const text = useAppStore((s) => s.text);
  const textScale = useAppStore((s) => s.textScale);
  const setStyle = useAppStore((s) => s.setStyleOverride);
  const setText = useAppStore((s) => s.setText);
  const setTextScale = useAppStore((s) => s.setTextScale);

  // Glyph-box / kerning debug overlay. Local to the StyleSetter view —
  // it's a viewing aid, not a style property, and never affects exports.
  const [debugOverlay, setDebugOverlay] = useState(false);

  // Effective style = font.style with the StyleSetter overlay merged in.
  // All reads in this component go through `eff` so the preview reflects
  // overrides immediately. All writes go via `setStyle` (the overlay).
  const eff = useMemo(
    () => effectiveStyle(font, styleOverrides),
    [font, styleOverrides],
  );

  const svg = useMemo(() => {
    const merged = fontWithOverrides(font, styleOverrides);
    const result = layout(text, merged);
    return renderLayoutToSvg(result, merged, {
      padding: 30,
      scale: textScale,
      debugOverlay,
    });
  }, [text, font, styleOverrides, textScale, debugOverlay]);

  const original = useMemo(
    () => builtInFonts.find((f) => f.id === font.id)?.style,
    [font.id],
  );

  return (
    <div
      className="mz-stylesetter"
      style={{ display: 'flex', gap: 24, padding: 16, height: '100%' }}
    >
      <div
        className="mz-stylesetter__sidebar"
        style={{
          width: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: 0 }}>StyleSetter</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
          Forward-only style overlay. Modulates the typeface for downstream
          rendering (TypeSetter) without writing back into the GlyphSetter
          baseline.
        </p>

        <Section title="Text">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Content</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                fontSize: 14,
                padding: 8,
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <Slider
            label="Preview scale"
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

        <StyleControls
          style={eff}
          setStyle={setStyle}
          {...(original ? { original } : {})}
        />
      </div>

      <div
        className="mz-stylesetter__preview"
        style={{
          flex: 1,
          background: '#ffffff',
          border: '1px solid #888',
          overflow: 'auto',
          padding: 16,
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
