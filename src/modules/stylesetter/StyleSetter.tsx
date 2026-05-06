import { useMemo } from 'react';
import { useState } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { useAppStore } from '../../state/store.js';
import type { CapShape, TriMode } from '../../core/types.js';

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
    <div className="mz-stylesetter" style={{ display: 'flex', gap: 24, padding: 16, height: '100%' }}>
      <div className="mz-stylesetter__sidebar" style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflowY: 'auto' }}>
        <h2 style={{ margin: 0 }}>StyleSetter</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
          Font-wide style. All settings here also appear in the GlyphSetter
          inspector under <em>Preview style</em>.
        </p>

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
          tooltip="Visual zoom for the preview only. Doesn't affect exported font units."
        />
        <Slider
          label="Slant"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={font.style.slant}
          onChange={(v) => setStyle({ slant: v })}
          tooltip="Italic shear in radians. Shears x by tan(slant) * y — positive leans glyphs to the right."
        />
        <Slider
          label="Scale X"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleX}
          onChange={(v) => setStyle({ scaleX: v })}
          tooltip="Horizontal stretch applied to every glyph (and its sidebearings). 1 = unchanged."
        />
        <Slider
          label="Scale Y"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleY}
          onChange={(v) => setStyle({ scaleY: v })}
          tooltip="Vertical stretch applied to every glyph (and its baseline offset). 1 = unchanged."
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
          tooltip="Default stroke width for every glyph (font units). Per-stroke widths can override this in the GlyphSetter."
        />
        <label
          title="Width direction. Off = stroke width is laid down perpendicular to the path tangent (round look). On = width is laid at a fixed world angle (nib-pen / calligraphy look)."
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
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
            tooltip="Angle of the virtual nib relative to the world (radians). Only used when world-oriented width is on."
          />
        )}

        <CapPicker
          label="Start cap"
          value={normalizeCap(font.style.capStart)}
          onChange={(v) => setStyle({ capStart: v })}
          tooltip="Cap shape at the first vertex of every stroke. round = semicircle. flat = perpendicular cut. tapered = pointed tip."
        />
        <CapPicker
          label="End cap"
          value={normalizeCap(font.style.capEnd)}
          onChange={(v) => setStyle({ capEnd: v })}
          tooltip="Cap shape at the last vertex of every stroke."
        />
        <Slider
          label="Cap bulge"
          min={0}
          max={2}
          step={0.05}
          value={font.style.capRoundBulge ?? 1}
          onChange={(v) => setStyle({ capRoundBulge: v })}
          tooltip="Roundness of round caps. 0 flattens to the chord, 1 = true semicircle, >1 pushes the cap further out."
        />

        <label
          title="Triangulation algorithm. earcut = minimal mesh from the outline polygon. ribbon-fixed = quad strip with N samples per Bezier segment. ribbon-density = quad strip with subdivision driven by glyph-unit spacing."
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <span>Triangulation</span>
          <select
            value={font.style.triMode ?? 'earcut'}
            onChange={(e) => setStyle({ triMode: e.target.value as TriMode })}
            style={{ padding: 4 }}
          >
            <option value="earcut">earcut (minimal)</option>
            <option value="ribbon-fixed">ribbon (fixed N)</option>
            <option value="ribbon-density">ribbon (density)</option>
          </select>
        </label>
        {font.style.triMode === 'ribbon-fixed' && (
          <Slider
            label="Samples / segment"
            min={0}
            max={64}
            step={1}
            value={font.style.ribbonSamples ?? 6}
            onChange={(v) => setStyle({ ribbonSamples: Math.round(v) })}
            tooltip="Interior samples per Bezier segment. Higher = smoother quad strip but more triangles."
          />
        )}
        {font.style.triMode === 'ribbon-density' && (
          <Slider
            label="Density"
            min={0.05}
            max={4}
            step={0.05}
            value={1 / Math.max(0.0001, font.style.ribbonSpacing ?? 4)}
            onChange={(v) => setStyle({ ribbonSpacing: 1 / Math.max(0.05, v) })}
            tooltip="Sample density (samples per glyph unit). Higher places samples closer along arc length."
          />
        )}
        {(font.style.triMode === 'ribbon-fixed' ||
          font.style.triMode === 'ribbon-density') && (
          <>
            <Slider
              label="Spread"
              min={0}
              max={1}
              step={0.05}
              value={font.style.ribbonSpread ?? 1}
              onChange={(v) => setStyle({ ribbonSpread: v })}
              tooltip="0 = parameter-uniform sample placement (fast, can clump in tight curves). 1 = arc-length-uniform."
            />
            <Slider
              label="Anchor pull"
              min={0}
              max={1}
              step={0.05}
              value={font.style.ribbonAnchorPull ?? 0}
              onChange={(v) => setStyle({ ribbonAnchorPull: v })}
              tooltip="Bias samples toward anchor points with active tangents (helps preserve sharp turns)."
            />
          </>
        )}

        <h3 className="mz-stylesetter__section-title" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Spacing
        </h3>
        <Slider
          label="Tracking"
          min={-30}
          max={60}
          step={1}
          value={font.style.tracking ?? 0}
          onChange={(v) => setStyle({ tracking: v })}
          tooltip="Extra horizontal space added between every pair of glyphs (font units). Negative tightens, positive opens up."
        />
        <Slider
          label="Space width"
          min={0}
          max={200}
          step={1}
          value={font.style.spaceWidth ?? 56}
          onChange={(v) => setStyle({ spaceWidth: v })}
          tooltip="Width of a literal space character (font units). Default ≈ 0.4× line height."
        />
        <Slider
          label="Line height"
          min={0.8}
          max={2.5}
          step={0.05}
          value={font.style.lineHeight ?? 1.2}
          onChange={(v) => setStyle({ lineHeight: v })}
          tooltip="Multiplier on the tallest glyph for vertical line stepping."
        />

        <KerningEditor
          pairs={font.style.kerning ?? {}}
          onChange={(kerning) => setStyle({ kerning })}
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

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  tooltip?: string;
}): JSX.Element {
  return (
    <label
      title={props.tooltip}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
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
  tooltip?: string;
}): JSX.Element {
  return (
    <label
      title={props.tooltip}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
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

function KerningEditor(props: {
  pairs: Readonly<Record<string, number>>;
  onChange: (pairs: Record<string, number>) => void;
}): JSX.Element {
  const [draftPair, setDraftPair] = useState('');
  const entries = Object.entries(props.pairs).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const setValue = (pair: string, v: number): void => {
    props.onChange({ ...props.pairs, [pair]: v });
  };
  const remove = (pair: string): void => {
    const next = { ...props.pairs };
    delete next[pair];
    props.onChange(next);
  };
  const add = (): void => {
    const p = [...draftPair].slice(0, 2).join('');
    if (p.length !== 2) return;
    if (props.pairs[p] !== undefined) return;
    setValue(p, 0);
    setDraftPair('');
  };

  return (
    <div className="mz-kerning" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3
        className="mz-stylesetter__section-title"
        title="Per-pair kerning adjustments. Value is added to the advance after the first character of the pair (negative = tighter, positive = looser). Type two characters above and click + Pair to add."
        style={{ margin: '12px 0 0', fontSize: 13 }}
      >
        Kerning pairs
      </h3>
      <div className="mz-kerning__add" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          className="mz-kerning__pair"
          type="text"
          value={draftPair}
          onChange={(e) => setDraftPair(e.target.value)}
          placeholder="AV"
          maxLength={2}
          title="Type the two-character pair to kern (e.g. AV)."
          style={{ width: 50, padding: '2px 4px', fontFamily: 'monospace' }}
        />
        <button
          className="mz-kerning__add-btn"
          type="button"
          onClick={add}
          disabled={[...draftPair].length !== 2}
          title="Add this pair with a starting value of 0."
        >
          + Pair
        </button>
        <span style={{ fontSize: 11, color: '#888' }}>
          {entries.length} pair{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      {entries.length === 0 && (
        <p style={{ fontSize: 11, color: '#888', margin: '4px 0' }}>
          No kerning pairs. Type two characters above and click + Pair.
        </p>
      )}
      {entries.map(([pair, value]) => (
        <div
          key={pair}
          className="mz-kerning__row"
          style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}
        >
          <code style={{ width: 36, fontFamily: 'monospace', fontSize: 13 }}>
            {pair}
          </code>
          <input
            type="range"
            min={-60}
            max={60}
            step={1}
            value={value}
            onChange={(e) => setValue(pair, parseFloat(e.target.value))}
            title="Kerning offset in font units (negative = tighter, positive = looser)."
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            type="number"
            value={value}
            step={1}
            onChange={(e) => setValue(pair, parseFloat(e.target.value) || 0)}
            title="Kerning offset in font units."
            style={{ width: 56, padding: '2px 4px', fontVariantNumeric: 'tabular-nums' }}
          />
          <button
            type="button"
            onClick={() => remove(pair)}
            title="Remove"
            style={{ padding: '0 6px', fontSize: 11 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
