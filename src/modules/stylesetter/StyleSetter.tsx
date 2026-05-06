import { useMemo } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { useAppStore } from '../../state/store.js';
import type { CapShape, EffectScope, TriMode } from '../../core/types.js';
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
        <Slider
          label="World blend"
          min={0}
          max={1}
          step={0.01}
          value={
            font.style.worldBlend ??
            (font.style.widthOrientation === 'world' ? 1 : 0)
          }
          onChange={(v) =>
            setStyle({
              worldBlend: v,
              widthOrientation: v >= 1 ? 'world' : 'tangent',
            })
          }
          defaultValue={
            original?.worldBlend ??
            (original?.widthOrientation === 'world' ? 1 : 0)
          }
          tooltip="0 = stroke width laid perpendicular to the path tangent (round look). 1 = fixed world-axis nib (calligraphy). Intermediate values blend the two normals — a 'leaning nib' that still tracks the spline."
        />
        {(font.style.worldBlend ??
          (font.style.widthOrientation === 'world' ? 1 : 0)) > 0 && (
          <Slider
            label="World angle (rad)"
            min={-Math.PI / 2}
            max={Math.PI / 2}
            step={0.01}
            value={font.style.worldAngle}
            onChange={(v) => setStyle({ worldAngle: v })}
            defaultValue={original?.worldAngle ?? 0}
            tooltip="Angle of the virtual nib relative to the world (radians). Used whenever World blend > 0."
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

        <h3 className="mz-stylesetter__section-title" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Effects
        </h3>
        <Slider
          label="Spline jitter"
          min={0}
          max={20}
          step={0.1}
          value={font.style.effects?.splineJitter?.amount ?? 0}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                splineJitter: {
                  ...(font.style.effects?.splineJitter ?? { scope: 'instance', seed: 1 }),
                  amount: v,
                },
              },
            })
          }
          defaultValue={0}
          tooltip="Random per-anchor displacement (font units) applied before stroke outlining. Each glyph instance gets its own offsets, so every set 'a' is slightly different."
        />
        <Slider
          label="Shape jitter"
          min={0}
          max={6}
          step={0.05}
          value={font.style.effects?.shapeJitter?.amount ?? 0}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                shapeJitter: {
                  ...(font.style.effects?.shapeJitter ?? { scope: 'instance', seed: 2 }),
                  amount: v,
                },
              },
            })
          }
          defaultValue={0}
          tooltip="Random per-vertex displacement (font units) applied to the outline polygon — wobbly edges without changing the underlying spline."
        />
        <EffectScopePicker
          label="Spline scope"
          value={font.style.effects?.splineJitter?.scope ?? 'instance'}
          onChange={(scope) =>
            setStyle({
              effects: {
                ...font.style.effects,
                splineJitter: {
                  ...(font.style.effects?.splineJitter ?? { amount: 0, seed: 1 }),
                  scope,
                },
              },
            })
          }
          tooltip="instance = each glyph occurrence different. glyph = every 'a' identical (but ≠ 'b'). text = one offset for everything."
        />
        <EffectScopePicker
          label="Shape scope"
          value={font.style.effects?.shapeJitter?.scope ?? 'instance'}
          onChange={(scope) =>
            setStyle({
              effects: {
                ...font.style.effects,
                shapeJitter: {
                  ...(font.style.effects?.shapeJitter ?? { amount: 0, seed: 2 }),
                  scope,
                },
              },
            })
          }
          tooltip="instance = each glyph occurrence different. glyph = every 'a' identical (but ≠ 'b'). text = one offset for everything."
        />
        <Slider
          label="Width wiggle"
          min={0}
          max={1}
          step={0.01}
          value={font.style.effects?.widthWiggle?.amount ?? 0}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                widthWiggle: {
                  ...(font.style.effects?.widthWiggle ?? { frequency: 0.05, scope: 'instance', seed: 3 }),
                  amount: v,
                },
              },
            })
          }
          defaultValue={0}
          tooltip="Random multiplicative wobble of stroke width along the path. 0 = off; 1 = ±100% width swing."
        />
        <Slider
          label="Wiggle freq"
          min={0.005}
          max={0.5}
          step={0.005}
          value={font.style.effects?.widthWiggle?.frequency ?? 0.05}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                widthWiggle: {
                  ...(font.style.effects?.widthWiggle ?? { amount: 0, scope: 'instance', seed: 3 }),
                  frequency: v,
                },
              },
            })
          }
          defaultValue={0.05}
          tooltip="Cycles per font unit of arc length. Higher = tighter wobble."
        />
        <EffectScopePicker
          label="Wiggle scope"
          value={font.style.effects?.widthWiggle?.scope ?? 'instance'}
          onChange={(scope) =>
            setStyle({
              effects: {
                ...font.style.effects,
                widthWiggle: {
                  ...(font.style.effects?.widthWiggle ?? { amount: 0, frequency: 0.05, seed: 3 }),
                  scope,
                },
              },
            })
          }
          tooltip="instance = each glyph occurrence different. glyph = every 'a' identical. text = one wobble pattern everywhere."
        />
        <Slider
          label="Taper start"
          min={0}
          max={2}
          step={0.01}
          value={font.style.effects?.widthTaper?.start ?? 1}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                widthTaper: {
                  ...(font.style.effects?.widthTaper ?? { end: 1, mode: 'stroke' }),
                  start: v,
                },
              },
            })
          }
          defaultValue={1}
          tooltip="Width multiplier at the start of the stroke (or each taper period). 1 = no change."
        />
        <Slider
          label="Taper end"
          min={0}
          max={2}
          step={0.01}
          value={font.style.effects?.widthTaper?.end ?? 1}
          onChange={(v) =>
            setStyle({
              effects: {
                ...font.style.effects,
                widthTaper: {
                  ...(font.style.effects?.widthTaper ?? { start: 1, mode: 'stroke' }),
                  end: v,
                },
              },
            })
          }
          defaultValue={1}
          tooltip="Width multiplier at the end of the stroke (or each taper period)."
        />
        <label
          title="Stroke = ramp spans the whole stroke, regardless of length. Length = ramp repeats every N font units (set below) so all strokes get the same physical taper period."
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
        >
          <span style={{ width: 110, flexShrink: 0 }}>Taper mode</span>
          <select
            value={font.style.effects?.widthTaper?.mode ?? 'stroke'}
            onChange={(e) =>
              setStyle({
                effects: {
                  ...font.style.effects,
                  widthTaper: {
                    ...(font.style.effects?.widthTaper ?? { start: 1, end: 1 }),
                    mode: e.target.value as 'stroke' | 'length',
                  },
                },
              })
            }
            style={{ flex: 1, padding: '1px 4px' }}
          >
            <option value="stroke">stroke</option>
            <option value="length">length</option>
          </select>
        </label>
        {font.style.effects?.widthTaper?.mode === 'length' && (
          <Slider
            label="Taper period"
            min={5}
            max={400}
            step={1}
            value={font.style.effects?.widthTaper?.length ?? 50}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...font.style.effects,
                  widthTaper: {
                    ...(font.style.effects!.widthTaper!),
                    length: v,
                  },
                },
              })
            }
            defaultValue={50}
            tooltip="In length-mode, taper repeats every this many font units of arc length."
          />
        )}
        <Slider
          label="Effects seed"
          min={0}
          max={1024}
          step={1}
          value={font.style.effects?.splineJitter?.seed ?? 1}
          onChange={(v) => {
            const s = Math.round(v);
            setStyle({
              effects: {
                ...font.style.effects,
                splineJitter: {
                  ...(font.style.effects?.splineJitter ?? { amount: 0, scope: 'instance' }),
                  seed: s,
                },
                shapeJitter: {
                  ...(font.style.effects?.shapeJitter ?? { amount: 0, scope: 'instance' }),
                  seed: s + 1,
                },
              },
            });
          }}
          defaultValue={1}
          tooltip="Re-roll the random pattern. Same seed always produces the same image."
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
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={Number(props.value.toFixed(4))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
        style={{
          width: 56,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: modified ? 'inherit' : 'var(--mz-text-mute)',
          padding: '1px 4px',
        }}
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

function EffectScopePicker(props: {
  label: string;
  value: EffectScope;
  onChange: (v: EffectScope) => void;
  tooltip?: string;
}): JSX.Element {
  return (
    <label
      title={props.tooltip}
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
    >
      <span style={{ width: 110, flexShrink: 0 }}>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as EffectScope)}
        style={{ flex: 1, padding: '1px 4px' }}
      >
        <option value="instance">instance</option>
        <option value="glyph">glyph</option>
        <option value="text">text</option>
      </select>
    </label>
  );
}
