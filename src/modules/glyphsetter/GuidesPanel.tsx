/**
 * Stackable guides panel for the GlyphSetter editor sidebar.
 *
 * Each guide layer can be toggled, recolored, faded, reordered, and
 * removed. New layers come from a preset menu — every preset reflects a
 * standard typography / calligraphy convention (cap/x/baseline/ascender
 * lines, golden ratio splits, italic slant grid, dot grid, etc.).
 */

import type { JSX } from 'react';
import {
  addLayer,
  CALLIGRAPHY_RANGES,
  calligraphyFromFontMetrics,
  defaultGuides,
  defaultKindFor,
  moveLayer,
  presetCalligraphy,
  presetDiagonals,
  presetDots,
  presetGolden,
  presetRings,
  presetSlant,
  presetSubdivisions,
  removeLayer,
  updateLayer,
  type GuideKind,
  type GuideLayer,
  type GuideSettings,
} from './guides.js';
import { measureFontMetrics } from './fontMetrics.js';
import { MoritzLabel } from '../../ui/MoritzText.js';
import { MoritzSelect } from '../../ui/MoritzSelect.js';

type Props = {
  value: GuideSettings;
  onChange: (next: GuideSettings) => void;
  refFontFamily?: string;
};

const PRESETS: { label: string; make: () => GuideLayer }[] = [
  { label: 'Calligraphy lines', make: presetCalligraphy },
  { label: 'Golden phi x', make: () => presetGolden('x', 3) },
  { label: 'Golden phi y', make: () => presetGolden('y', 3) },
  { label: 'Columns 4', make: () => presetSubdivisions(4, 'x') },
  { label: 'Columns 8', make: () => presetSubdivisions(8, 'x') },
  { label: 'Rows 4', make: () => presetSubdivisions(4, 'y') },
  { label: 'Rows 8', make: () => presetSubdivisions(8, 'y') },
  { label: 'Diagonals', make: () => presetDiagonals(true) },
  { label: 'Slant 12 deg', make: () => presetSlant(12, 10) },
  { label: 'Slant 20 deg', make: () => presetSlant(20, 8) },
  { label: 'Rings 4', make: () => presetRings(4, 0.2) },
  { label: 'Dot grid', make: () => presetDots(10, 0.6) },
];

export function GuidesPanel(props: Props): JSX.Element {
  const { value, onChange, refFontFamily } = props;
  const alignToRefFont = (): void => {
    if (!refFontFamily) return;
    const m = measureFontMetrics(refFontFamily);
    const calliKind: GuideKind = { kind: 'calligraphy', ...calligraphyFromFontMetrics(m) };
    const existing = value.layers.find((l) => l.kind.kind === 'calligraphy');
    if (existing) {
      onChange(updateLayer(value, existing.id, { kind: calliKind, visible: true }));
    } else {
      const layer = presetCalligraphy();
      onChange(addLayer(value, { ...layer, kind: calliKind }));
    }
  };
  return (
    <div className="mz-guides" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <strong>
          <MoritzLabel text="Guides" size={12} />
        </strong>
        <button
          type="button"
          className="mz-btn--warn"
          onClick={() => onChange(defaultGuides())}
          title="Reset all guide layers to the built-in defaults (calligraphy + golden + columns)."
          style={{ marginLeft: 'auto', fontSize: 10, padding: '0 6px' }}
        >
          <MoritzLabel text="Reset all" size={10} />
        </button>
      </label>
      <button
        type="button"
        onClick={alignToRefFont}
        disabled={!refFontFamily}
        title={
          refFontFamily
            ? 'Measure the chosen reference font and adjust the calligraphy guide so its baseline / cap-height / x-height / ascender / descender match the font exactly. Creates a calligraphy layer if none exists.'
            : 'Pick a Reference font in the View section first.'
        }
        style={{ fontSize: 11, padding: '2px 6px' }}
      >
        <MoritzLabel text="Align to reference font" size={11} />
      </button>
      <MoritzSelect
        value=""
        options={[
          { value: '', label: 'Add guide', disabled: true },
          ...PRESETS.map((preset, index) => ({
            value: String(index),
            label: preset.label,
          })),
        ]}
        onChange={(selected) => {
          const idx = Number(selected);
          if (!Number.isFinite(idx) || idx < 0) return;
          const p = PRESETS[idx];
          if (!p) return;
          onChange(addLayer(value, p.make()));
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {value.layers.map((l, idx) => (
          <LayerRow
            key={l.id}
            layer={l}
            isFirst={idx === 0}
            isLast={idx === value.layers.length - 1}
            onChange={(patch) => onChange(updateLayer(value, l.id, patch))}
            onRemove={() => onChange(removeLayer(value, l.id))}
            onMove={(dir) => onChange(moveLayer(value, l.id, dir))}
          />
        ))}
        {value.layers.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--mz-text-mute)', fontStyle: 'italic' }}>
            <MoritzLabel text="No guide layers add one above" size={11} />
          </div>
        )}
      </div>
    </div>
  );
}

function LayerRow(props: {
  layer: GuideLayer;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<GuideLayer>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}): JSX.Element {
  const { layer, isFirst, isLast, onChange, onRemove, onMove } = props;
  return (
    <div
      className={`mz-guides__layer mz-guides__layer--${layer.kind.kind}`}
      style={{
        border: '1px solid var(--mz-line)',
        borderRadius: 4,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--mz-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(e) => onChange({ visible: e.target.checked })}
          title="Visible"
        />
        <input
          type="color"
          value={layer.color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'transparent' }}
          title="Color"
        />
        <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <MoritzLabel text={layer.label} size={11} />
        </span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          style={{ fontSize: 10, padding: '0 4px' }}
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast}
          style={{ fontSize: 10, padding: '0 4px' }}
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="mz-btn--warn"
          onClick={() => onChange({ kind: defaultKindFor(layer.kind) })}
          style={{ fontSize: 10, padding: '0 4px' }}
          title="Reset this layer's parameters to the preset defaults."
        >
          ↺
        </button>
        <button
          type="button"
          className="mz-btn--warn"
          onClick={onRemove}
          style={{ fontSize: 10, padding: '0 4px' }}
          title="Remove"
        >
          ✕
        </button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <span style={{ width: 50 }}>
          <MoritzLabel text="opacity" size={10} />
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ width: 28, textAlign: 'right' }}>{layer.opacity.toFixed(2)}</span>
      </label>
      <KindEditor kind={layer.kind} onChange={(kind) => onChange({ kind })} />
    </div>
  );
}

function KindEditor(props: {
  kind: GuideKind;
  onChange: (k: GuideKind) => void;
}): JSX.Element | null {
  const { kind, onChange } = props;
  switch (kind.kind) {
    case 'subdivisions':
      return (
        <Row label={`${kind.axis === 'x' ? 'cols' : 'rows'}`}>
          <input
            type="range"
            min={2}
            max={64}
            step={1}
            value={kind.n}
            onChange={(e) => onChange({ ...kind, n: Math.max(2, Number(e.target.value) | 0) })}
            style={{ flex: 1 }}
          />
          <span style={{ width: 24, textAlign: 'right' }}>{kind.n}</span>
        </Row>
      );
    case 'golden':
      return (
        <>
          <Row label="depth">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={kind.depth}
              onChange={(e) => onChange({ ...kind, depth: Math.max(1, Number(e.target.value) | 0) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 24, textAlign: 'right' }}>{kind.depth}</span>
          </Row>
          <Row label="rotate°">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round(((kind.rotation ?? 0) * 180) / Math.PI)}
              onChange={(e) =>
                onChange({ ...kind, rotation: (Number(e.target.value) * Math.PI) / 180 })
              }
              style={{ flex: 1 }}
            />
            <span style={{ width: 32, textAlign: 'right' }}>
              {Math.round(((kind.rotation ?? 0) * 180) / Math.PI)}°
            </span>
          </Row>
          <Row label="scale">
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.01}
              value={kind.scale ?? 1}
              onChange={(e) => onChange({ ...kind, scale: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 32, textAlign: 'right' }}>{(kind.scale ?? 1).toFixed(2)}</span>
          </Row>
          <Row label="x off">
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={kind.offsetX ?? 0}
              onChange={(e) => onChange({ ...kind, offsetX: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 32, textAlign: 'right' }}>{Math.round(kind.offsetX ?? 0)}</span>
          </Row>
          <Row label="y off">
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={kind.offsetY ?? 0}
              onChange={(e) => onChange({ ...kind, offsetY: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 32, textAlign: 'right' }}>{Math.round(kind.offsetY ?? 0)}</span>
          </Row>
          <Row label="show">
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={kind.spiral ?? true}
                onChange={(e) => onChange({ ...kind, spiral: e.target.checked })}
              />
              <MoritzLabel text="spiral" size={10} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={kind.splits ?? false}
                onChange={(e) => onChange({ ...kind, splits: e.target.checked })}
              />
              <MoritzLabel text="splits" size={10} />
            </label>
          </Row>
        </>
      );
    case 'slant':
      return (
        <>
          <Row label="angle°">
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={Math.round((kind.angle * 180) / Math.PI)}
              onChange={(e) =>
                onChange({ ...kind, angle: (Number(e.target.value) * Math.PI) / 180 })
              }
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>
              {Math.round((kind.angle * 180) / Math.PI)}°
            </span>
          </Row>
          <Row label="spacing">
            <input
              type="range"
              min={2}
              max={50}
              step={0.5}
              value={kind.spacing}
              onChange={(e) => onChange({ ...kind, spacing: Math.max(0.5, Number(e.target.value)) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{kind.spacing.toFixed(1)}</span>
          </Row>
        </>
      );
    case 'rings':
      return (
        <>
          <Row label="count">
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={kind.count}
              onChange={(e) => onChange({ ...kind, count: Math.max(1, Number(e.target.value) | 0) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 24, textAlign: 'right' }}>{kind.count}</span>
          </Row>
          <Row label="inner">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={kind.innerRatio}
              onChange={(e) => onChange({ ...kind, innerRatio: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{kind.innerRatio.toFixed(2)}</span>
          </Row>
        </>
      );
    case 'calligraphy':
      return (
        <>
          <CalligraphySlider
            label="cap-height"
            field="capHeight"
            kind={kind}
            onChange={onChange}
          />
          <CalligraphySlider
            label="x-height"
            field="xHeight"
            kind={kind}
            onChange={onChange}
            help="x-height as fraction of cap"
          />
          <CalligraphySlider
            label="ascender"
            field="ascender"
            kind={kind}
            onChange={onChange}
          />
          <CalligraphySlider
            label="descender"
            field="descender"
            kind={kind}
            onChange={onChange}
          />
          <CalligraphySlider
            label="balance"
            field="weight"
            kind={kind}
            onChange={onChange}
            help="− top-heavy, + bottom-heavy"
          />
        </>
      );
    case 'dots':
      return (
        <>
          <Row label="spacing">
            <input
              type="range"
              min={2}
              max={40}
              step={0.5}
              value={kind.spacing}
              onChange={(e) => onChange({ ...kind, spacing: Math.max(0.5, Number(e.target.value)) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{kind.spacing.toFixed(1)}</span>
          </Row>
          <Row label="r">
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={kind.radiusUnits}
              onChange={(e) =>
                onChange({ ...kind, radiusUnits: Math.max(0.05, Number(e.target.value)) })
              }
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{kind.radiusUnits.toFixed(1)}</span>
          </Row>
        </>
      );
    case 'diagonals':
      return (
        <Row label="cross">
          <input
            type="checkbox"
            checked={kind.cross}
            onChange={(e) => onChange({ ...kind, cross: e.target.checked })}
          />
        </Row>
      );
    default: {
      const _: never = kind;
      void _;
      return null;
    }
  }
}

function Row(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <span style={{ width: 50 }}>
        <MoritzLabel text={props.label} size={10} />
      </span>
      {props.children}
    </label>
  );
}

type CalligraphyKind = Extract<GuideKind, { kind: 'calligraphy' }>;
type CalligraphyField = keyof typeof CALLIGRAPHY_RANGES;

function CalligraphySlider(props: {
  label: string;
  field: CalligraphyField;
  kind: CalligraphyKind;
  onChange: (k: CalligraphyKind) => void;
  help?: string;
}): JSX.Element {
  const r = CALLIGRAPHY_RANGES[props.field];
  const v = props.kind[props.field];
  return (
    <Row label={props.label}>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={0.005}
        value={v}
        onChange={(e) => props.onChange({ ...props.kind, [props.field]: Number(e.target.value) })}
        style={{ flex: 1 }}
        title={props.help}
      />
      <input
        type="number"
        min={r.min}
        max={r.max}
        step={0.005}
        value={Number(v.toFixed(4))}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) props.onChange({ ...props.kind, [props.field]: n });
        }}
        style={{ width: 52, textAlign: 'right', padding: '1px 4px' }}
      />
    </Row>
  );
}
