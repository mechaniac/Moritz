import { useMemo } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { useAppStore } from '../../state/store.js';
import type { CapShape, TriMode } from '../../core/types.js';
import { builtInFonts } from '../../data/builtInFonts.js';

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

  // Bundled original (if this font is a built-in or shares an id with one)
  // — used to mark sliders red when their value differs from the default.
  const original = useMemo(
    () => builtInFonts.find((f) => f.id === font.id)?.style,
    [font.id],
  );
  const origWidth = original?.defaultWidth.samples[0]?.width;

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
          defaultValue={original?.slant}
          tooltip="Italic shear in radians. Shears x by tan(slant) * y — positive leans glyphs to the right."
        />
        <Slider
          label="Scale X"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleX}
          onChange={(v) => setStyle({ scaleX: v })}
          defaultValue={original?.scaleX}
          tooltip="Horizontal stretch applied to every glyph (and its sidebearings). 1 = unchanged."
        />
        <Slider
          label="Scale Y"
          min={0.4}
          max={2}
          step={0.01}
          value={font.style.scaleY}
          onChange={(v) => setStyle({ scaleY: v })}
          defaultValue={original?.scaleY}
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
          defaultValue={origWidth}
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
          defaultValue={original?.capRoundBulge ?? 1}
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
          defaultValue={original?.tracking ?? 0}
          tooltip="Extra horizontal space added between every pair of glyphs (font units). Negative tightens, positive opens up."
        />
        <Slider
          label="Space width"
          min={0}
          max={200}
          step={1}
          value={font.style.spaceWidth ?? 56}
          onChange={(v) => setStyle({ spaceWidth: v })}
          defaultValue={original?.spaceWidth ?? 56}
          tooltip="Width of a literal space character (font units). Default ≈ 0.4× line height."
        />
        <Slider
          label="Line height"
          min={0.8}
          max={2.5}
          step={0.05}
          value={font.style.lineHeight ?? 1.2}
          onChange={(v) => setStyle({ lineHeight: v })}
          defaultValue={original?.lineHeight ?? 1.2}
          tooltip="Multiplier on the tallest glyph for vertical line stepping."
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
  defaultValue?: number;
}): JSX.Element {
  const modified =
    props.defaultValue !== undefined &&
    Math.abs(props.value - props.defaultValue) > 1e-9;
  return (
    <label
      title={props.tooltip}
      className={modified ? 'mz-modified' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
    >
      <span style={{ width: 110, flexShrink: 0, color: 'inherit' }}>
        {props.label}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span
        style={{
          width: 40,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: modified ? 'inherit' : 'var(--mz-text-mute)',
        }}
      >
        {props.value.toFixed(2)}
      </span>
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
