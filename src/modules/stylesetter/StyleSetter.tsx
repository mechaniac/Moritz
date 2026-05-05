import { useMemo } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { useAppStore } from '../../state/store.js';
import type { CapShape } from '../../core/types.js';

/**
 * StyleSetter — sliders bound to StyleSettings, with live SVG preview of the
 * current text in the active font. This is also Moritz's first end-to-end
 * pipeline test: layout → transform → outline → svg.
 */
export function StyleSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const text = useAppStore((s) => s.text);
  const textScale = useAppStore((s) => s.textScale);
  const setStyle = useAppStore((s) => s.setStyle);
  const setText = useAppStore((s) => s.setText);
  const setTextScale = useAppStore((s) => s.setTextScale);

  const svg = useMemo(() => {
    const result = layout(text, font);
    return renderLayoutToSvg(result, font, { padding: 30, scale: textScale });
  }, [text, font, textScale]);

  const widthValue = font.style.defaultWidth.samples[0]?.width ?? 8;

  return (
    <div style={{ display: 'flex', gap: 24, padding: 16, height: '100%' }}>
      <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <h2 style={{ margin: 0 }}>StyleSetter</h2>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Text</span>
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
          label="Text Scale"
          min={0.2}
          max={3}
          step={0.05}
          value={textScale}
          onChange={setTextScale}
        />
        <Slider
          label="Slant"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={font.style.slant}
          onChange={(v) => setStyle({ slant: v })}
        />
        <Slider
          label="Scale X"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleX}
          onChange={(v) => setStyle({ scaleX: v })}
        />
        <Slider
          label="Scale Y"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleY}
          onChange={(v) => setStyle({ scaleY: v })}
        />
        <Slider
          label="Stroke Width"
          min={1}
          max={28}
          step={0.5}
          value={widthValue}
          onChange={(v) =>
            setStyle({
              defaultWidth: {
                samples: [
                  { t: 0, width: v },
                  { t: 1, width: v },
                ],
              },
            })
          }
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={font.style.widthOrientation === 'world'}
            onChange={(e) =>
              setStyle({ widthOrientation: e.target.checked ? 'world' : 'tangent' })
            }
          />
          World-oriented width (nib pen)
        </label>
        {font.style.widthOrientation === 'world' && (
          <Slider
            label="World angle (rad)"
            min={-Math.PI / 2}
            max={Math.PI / 2}
            step={0.01}
            value={font.style.worldAngle}
            onChange={(v) => setStyle({ worldAngle: v })}
          />
        )}

        <CapPicker
          label="Start cap"
          value={normalizeCap(font.style.capStart)}
          onChange={(v) => setStyle({ capStart: v })}
        />
        <CapPicker
          label="End cap"
          value={normalizeCap(font.style.capEnd)}
          onChange={(v) => setStyle({ capEnd: v })}
        />
        <Slider
          label="Bevel amount"
          min={0}
          max={1}
          step={0.01}
          value={font.style.bevelAmount ?? 1}
          onChange={(v) => setStyle({ bevelAmount: v })}
        />
      </div>

      <div
        style={{
          flex: 1,
          background: '#fafafa',
          border: '1px solid #ddd',
          borderRadius: 6,
          overflow: 'auto',
          padding: 16,
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{props.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#666' }}>
          {props.value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

type SimpleCap = 'round' | 'flat' | 'tapered';

function normalizeCap(c: CapShape): SimpleCap {
  return c === 'round' || c === 'flat' || c === 'tapered' ? c : 'round';
}

function CapPicker(props: {
  label: string;
  value: SimpleCap;
  onChange: (v: SimpleCap) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as SimpleCap)}
        style={{ padding: 4 }}
      >
        <option value="round">round</option>
        <option value="flat">flat</option>
        <option value="tapered">tapered</option>
      </select>
    </label>
  );
}
