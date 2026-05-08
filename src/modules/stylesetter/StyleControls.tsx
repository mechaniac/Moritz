/**
 * Shared style-controls panel used by both StyleSetter (sidebar) and
 * GlyphSetter (inspector). Renders every `StyleSettings` knob grouped into
 * subtle bordered sections.
 *
 * Pure UI — receives the current style + a setter, and an optional
 * `original` to mark sliders red when their value differs from the baseline.
 */

import { useState, type ReactNode } from 'react';
import {
  ribbonCapSubdivOf,
  ribbonSpineLengthAwareOf,
  ribbonSpineSubdivOf,
  type CapShape,
  type EffectScope,
  type StyleSettings,
  type TriMode,
} from '../../core/types.js';
import { defaultFont } from '../../data/defaultFont.js';

const FALLBACK_BASELINE: StyleSettings = defaultFont.style;
const EFFECT_SECTIONS: readonly SectionId[] = [
  'splineJitter',
  'shapeJitter',
  'widthWiggle',
  'widthTaper',
  'randomness',
];

const CAP_OPTIONS = [
  { value: 'round', label: 'round' },
  { value: 'flat', label: 'flat' },
  { value: 'tapered', label: 'tapered' },
] as const;

export type StyleControlsProps = {
  style: StyleSettings;
  setStyle: (patch: Partial<StyleSettings>) => void;
  /** Baseline values used to mark "modified" controls. Optional. */
  original?: StyleSettings;
  /** Sections to omit, e.g. when the host already has its own. */
  omit?: ReadonlySet<SectionId>;
};

export type SectionId =
  | 'geometry'
  | 'stroke'
  | 'triangulation'
  | 'spacing'
  | 'splineJitter'
  | 'shapeJitter'
  | 'widthWiggle'
  | 'widthTaper'
  | 'randomness';

/**
 * Build a patch that reverts every control owned by `id` to its baseline
 * value, based on the current style. Returns null when nothing in the
 * section is modified relative to `o`.
 */
function makeSectionPatch(
  id: SectionId,
  o: StyleSettings,
  c: StyleSettings,
): Partial<StyleSettings> | null {
  type P = { -readonly [K in keyof StyleSettings]?: StyleSettings[K] };
  const has = (p: P): Partial<StyleSettings> | null =>
    Object.keys(p).length ? (p as Partial<StyleSettings>) : null;
  switch (id) {
    case 'geometry': {
      const p: P = {};
      if (c.slant !== o.slant) p.slant = o.slant;
      if (c.scaleX !== o.scaleX) p.scaleX = o.scaleX;
      if (c.scaleY !== o.scaleY) p.scaleY = o.scaleY;
      return has(p);
    }
    case 'stroke': {
      const p: P = {};
      const cw = c.defaultWidth.samples[0]?.width;
      const ow = o.defaultWidth.samples[0]?.width;
      if (cw !== ow) p.defaultWidth = o.defaultWidth;
      const cBlend = c.worldBlend ?? (c.widthOrientation === 'world' ? 1 : 0);
      const oBlend = o.worldBlend ?? (o.widthOrientation === 'world' ? 1 : 0);
      if (cBlend !== oBlend) {
        p.worldBlend = oBlend;
        p.widthOrientation = o.widthOrientation;
      }
      if ((c.worldContract ?? 0) !== (o.worldContract ?? 0))
        p.worldContract = o.worldContract;
      if ((c.worldAngle ?? 0) !== (o.worldAngle ?? 0)) p.worldAngle = o.worldAngle;
      if ((c.worldContractAngle ?? c.worldAngle ?? 0) !== (o.worldContractAngle ?? o.worldAngle ?? 0))
        p.worldContractAngle = o.worldContractAngle;
      if (normalizeCap(c.capStart) !== normalizeCap(o.capStart))
        p.capStart = o.capStart;
      if (normalizeCap(c.capEnd) !== normalizeCap(o.capEnd))
        p.capEnd = o.capEnd;
      if ((c.capRoundBulge ?? 1) !== (o.capRoundBulge ?? 1))
        p.capRoundBulge = o.capRoundBulge;
      return has(p);
    }
    case 'triangulation': {
      const p: P = {};
      if ((c.triMode ?? 'earcut') !== (o.triMode ?? 'earcut'))
        p.triMode = o.triMode;
      if (ribbonSpineSubdivOf(c) !== ribbonSpineSubdivOf(o))
        p.ribbonSpineSubdiv = o.ribbonSpineSubdiv;
      if ((c.ribbonBorderSubdiv ?? 0) !== (o.ribbonBorderSubdiv ?? 0))
        p.ribbonBorderSubdiv = o.ribbonBorderSubdiv;
      if (ribbonCapSubdivOf(c) !== ribbonCapSubdivOf(o))
        p.ribbonCapSubdiv = o.ribbonCapSubdiv;
      if ((c.ribbonBrokenAnchorSubdiv ?? 0) !== (o.ribbonBrokenAnchorSubdiv ?? 0))
        p.ribbonBrokenAnchorSubdiv = o.ribbonBrokenAnchorSubdiv;
      if (ribbonSpineLengthAwareOf(c) !== ribbonSpineLengthAwareOf(o))
        p.ribbonSpineLengthAware = o.ribbonSpineLengthAware;
      if ((c.vertexEvenness ?? 0) !== (o.vertexEvenness ?? 0))
        p.vertexEvenness = o.vertexEvenness;
      if ((c.relaxCurves ?? 0) !== (o.relaxCurves ?? 0))
        p.relaxCurves = o.relaxCurves;
      if ((c.relaxTangents ?? 0) !== (o.relaxTangents ?? 0))
        p.relaxTangents = o.relaxTangents;
      return has(p);
    }
    case 'spacing': {
      const p: P = {};
      if ((c.tracking ?? 0) !== (o.tracking ?? 0)) p.tracking = o.tracking;
      if ((c.spaceWidth ?? 56) !== (o.spaceWidth ?? 56))
        p.spaceWidth = o.spaceWidth;
      if ((c.lineHeight ?? 1.2) !== (o.lineHeight ?? 1.2))
        p.lineHeight = o.lineHeight;
      return has(p);
    }
    case 'splineJitter': {
      const cAmt = c.effects?.splineJitter?.amount ?? 0;
      const cScope = c.effects?.splineJitter?.scope ?? 'instance';
      const oAmt = o.effects?.splineJitter?.amount ?? 0;
      const oScope = o.effects?.splineJitter?.scope ?? 'instance';
      if (cAmt === oAmt && cScope === oScope) return null;
      return {
        effects: {
          ...c.effects,
          splineJitter: {
            ...(c.effects?.splineJitter ?? { seed: 1 }),
            amount: oAmt,
            scope: oScope,
          },
        },
      };
    }
    case 'shapeJitter': {
      const cAmt = c.effects?.shapeJitter?.amount ?? 0;
      const cScope = c.effects?.shapeJitter?.scope ?? 'instance';
      const oAmt = o.effects?.shapeJitter?.amount ?? 0;
      const oScope = o.effects?.shapeJitter?.scope ?? 'instance';
      if (cAmt === oAmt && cScope === oScope) return null;
      return {
        effects: {
          ...c.effects,
          shapeJitter: {
            ...(c.effects?.shapeJitter ?? { seed: 2 }),
            amount: oAmt,
            scope: oScope,
          },
        },
      };
    }
    case 'widthWiggle': {
      const cAmt = c.effects?.widthWiggle?.amount ?? 0;
      const cFrq = c.effects?.widthWiggle?.frequency ?? 0.05;
      const cScope = c.effects?.widthWiggle?.scope ?? 'instance';
      const oAmt = o.effects?.widthWiggle?.amount ?? 0;
      const oFrq = o.effects?.widthWiggle?.frequency ?? 0.05;
      const oScope = o.effects?.widthWiggle?.scope ?? 'instance';
      if (cAmt === oAmt && cFrq === oFrq && cScope === oScope) return null;
      return {
        effects: {
          ...c.effects,
          widthWiggle: {
            ...(c.effects?.widthWiggle ?? { seed: 3 }),
            amount: oAmt,
            frequency: oFrq,
            scope: oScope,
          },
        },
      };
    }
    case 'widthTaper': {
      const cStart = c.effects?.widthTaper?.start ?? 1;
      const cEnd = c.effects?.widthTaper?.end ?? 1;
      const cMode = c.effects?.widthTaper?.mode ?? 'stroke';
      const cLen = c.effects?.widthTaper?.length ?? 50;
      const oStart = o.effects?.widthTaper?.start ?? 1;
      const oEnd = o.effects?.widthTaper?.end ?? 1;
      const oMode = o.effects?.widthTaper?.mode ?? 'stroke';
      const oLen = o.effects?.widthTaper?.length ?? 50;
      if (
        cStart === oStart &&
        cEnd === oEnd &&
        cMode === oMode &&
        cLen === oLen
      )
        return null;
      return {
        effects: {
          ...c.effects,
          widthTaper: {
            ...(c.effects?.widthTaper ?? {}),
            start: oStart,
            end: oEnd,
            mode: oMode,
            length: oLen,
          },
        },
      };
    }
    case 'randomness': {
      const cSeed = c.effects?.splineJitter?.seed ?? 1;
      const oSeed = o.effects?.splineJitter?.seed ?? 1;
      if (cSeed === oSeed) return null;
      return {
        effects: {
          ...c.effects,
          splineJitter: {
            ...(c.effects?.splineJitter ?? { amount: 0, scope: 'instance' }),
            seed: oSeed,
          },
          shapeJitter: {
            ...(c.effects?.shapeJitter ?? { amount: 0, scope: 'instance' }),
            seed: (o.effects?.shapeJitter?.seed ?? oSeed + 1),
          },
        },
      };
    }
  }
}

export function StyleControls(props: StyleControlsProps): JSX.Element {
  const { style, setStyle, original, omit } = props;
  const baseline = original ?? FALLBACK_BASELINE;
  const widthValue = style.defaultWidth.samples[0]?.width ?? 8;
  const origWidth = baseline.defaultWidth.samples[0]?.width;
  const show = (id: SectionId): boolean => !omit?.has(id);
  const sectionReset = (
    id: SectionId,
  ): { onClick: () => void; modified: boolean } => {
    const patch = makeSectionPatch(id, baseline, style);
    return {
      onClick: () => {
        if (patch) setStyle(patch);
      },
      modified: !!patch,
    };
  };
  const bulkReset = (
    ids: readonly SectionId[],
  ): { onClick: () => void; modified: boolean } => {
    const patches = ids
      .map((id) => makeSectionPatch(id, baseline, style))
      .filter((p): p is Partial<StyleSettings> => !!p);
    const merged: { -readonly [K in keyof StyleSettings]?: StyleSettings[K] } = {};
    for (const p of patches) Object.assign(merged, p);
    const effs = patches
      .map((p) => p.effects)
      .filter((e): e is StyleSettings['effects'] => !!e);
    if (effs.length) {
      let combined: StyleSettings['effects'] = { ...style.effects };
      for (const e of effs) combined = { ...combined, ...e };
      merged.effects = combined;
    }
    return {
      onClick: () => {
        if (patches.length) setStyle(merged);
      },
      modified: patches.length > 0,
    };
  };
  const ALL_SECTIONS: readonly SectionId[] = [
    'geometry',
    'stroke',
    'triangulation',
    'spacing',
    ...EFFECT_SECTIONS,
  ];
  const allStyles = bulkReset(ALL_SECTIONS.filter(show));
  const allEffects = bulkReset(EFFECT_SECTIONS.filter(show));

  return (
    <>
      <BulkResetBar label="All styles" reset={allStyles} />
      {show('geometry') && (
        <Section title="Geometry" reset={sectionReset('geometry')}>
          <Slider
            label="Slant"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={style.slant}
            onChange={(v) => setStyle({ slant: v })}
            defaultValue={original?.slant}
            tooltip="Italic shear in radians. Shears x by tan(slant) * y — positive leans glyphs to the right."
          />
          <Slider
            label="Scale X"
            min={0.4}
            max={2}
            step={0.01}
            value={style.scaleX}
            onChange={(v) => setStyle({ scaleX: v })}
            defaultValue={original?.scaleX}
            tooltip="Horizontal stretch applied to every glyph (and its sidebearings). 1 = unchanged."
          />
          <Slider
            label="Scale Y"
            min={0.4}
            max={2}
            step={0.01}
            value={style.scaleY}
            onChange={(v) => setStyle({ scaleY: v })}
            defaultValue={original?.scaleY}
            tooltip="Vertical stretch applied to every glyph (and its baseline offset). 1 = unchanged."
          />
        </Section>
      )}

      {show('stroke') && (
        <Section title="Stroke" reset={sectionReset('stroke')}>
          <Slider
            label="Stroke width"
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
            value={style.worldBlend ?? (style.widthOrientation === 'world' ? 1 : 0)}
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
          <Slider
            label="World contract"
            min={0}
            max={1}
            step={0.01}
            value={style.worldContract ?? 0}
            onChange={(v) => setStyle({ worldContract: v })}
            defaultValue={original?.worldContract ?? 0}
            tooltip="0 = no contraction. 1 = stroke width collapses to zero where the offset normal is perpendicular to the world axis. Models a chisel nib whose thickness varies with alignment to the world angle. Independent of World blend."
          />
          {((style.worldBlend ?? (style.widthOrientation === 'world' ? 1 : 0)) >
            0) && (
            <Slider
              label="World blend angle (rad)"
              min={-Math.PI / 2}
              max={Math.PI / 2}
              step={0.01}
              value={style.worldAngle}
              onChange={(v) => setStyle({ worldAngle: v })}
              defaultValue={original?.worldAngle ?? 0}
              tooltip="Angle of the virtual nib used by World blend (radians)."
            />
          )}
          {((style.worldContract ?? 0) > 0) && (
            <Slider
              label="World contract angle (rad)"
              min={-Math.PI / 2}
              max={Math.PI / 2}
              step={0.01}
              value={style.worldContractAngle ?? style.worldAngle}
              onChange={(v) => setStyle({ worldContractAngle: v })}
              defaultValue={original?.worldContractAngle ?? original?.worldAngle ?? 0}
              tooltip="Angle (radians) along which World contract narrows the stroke. Independent of World blend angle — lets you lay the chisel along one axis and contract along another. Defaults to the World blend angle when unset."
            />
          )}
          <InlineSelect
            label="Start cap"
            value={normalizeCap(style.capStart)}
            onChange={(v) => setStyle({ capStart: v as SimpleCap })}
            options={CAP_OPTIONS}
            defaultValue={original ? normalizeCap(original.capStart) : undefined}
            tooltip="Cap shape at the first vertex of every stroke. round = semicircle. flat = perpendicular cut. tapered = pointed tip."
          />
          <InlineSelect
            label="End cap"
            value={normalizeCap(style.capEnd)}
            onChange={(v) => setStyle({ capEnd: v as SimpleCap })}
            options={CAP_OPTIONS}
            defaultValue={original ? normalizeCap(original.capEnd) : undefined}
            tooltip="Cap shape at the last vertex of every stroke."
          />
          <Slider
            label="Cap bulge"
            min={0}
            max={2}
            step={0.05}
            value={style.capRoundBulge ?? 1}
            onChange={(v) => setStyle({ capRoundBulge: v })}
            defaultValue={original?.capRoundBulge ?? 1}
            tooltip="Roundness of round caps. 0 flattens to the chord, 1 = true semicircle, >1 pushes the cap further out."
          />
        </Section>
      )}

      {show('triangulation') && (
        <Section title="Triangulation" reset={sectionReset('triangulation')}>
          <InlineSelect
            label="Mode"
            value={style.triMode ?? 'earcut'}
            onChange={(v) => setStyle({ triMode: v as TriMode })}
            options={[
              { value: 'earcut', label: 'earcut (minimal)' },
              { value: 'ribbon-fixed', label: 'ribbon (subdivided, fixed)' },
              { value: 'ribbon-density', label: 'ribbon (subdivided, density)' },
            ]}
            defaultValue={original?.triMode ?? 'earcut'}
            tooltip="earcut: minimal mesh from the outline polygon. ribbon: hierarchical quad strip — spline0 (anchors) → spline1 (spineSubdiv vertices added per segment) → border polylines (offset ±halfWidth along bent normal) → shape vertices (borderSubdiv linear interpolations between border vertices)."
          />
          {(style.triMode === 'ribbon-fixed' ||
            style.triMode === 'ribbon-density') && (
            <>
              <Slider
                label="Spine subdiv"
                min={0}
                max={32}
                step={1}
                value={ribbonSpineSubdivOf(style)}
                onChange={(v) => setStyle({ ribbonSpineSubdiv: Math.round(v) })}
                defaultValue={original ? ribbonSpineSubdivOf(original) : ribbonSpineSubdivOf(style)}
                tooltip="Vertices added BETWEEN each pair of spline0 anchors when building the spine (spline1). 0 = anchors only, 1 = one extra in the middle, etc. Distribution is arc-length-uniform within each Bezier segment."
              />
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'inherit' }}
                title="When on, distribute spine subdivisions across segments according to each segment's arc length (longer = more interior vertices). Step size derived from `Spine subdiv` applied to the average segment. Each segment still gets an integer count and uniform spacing within itself."
              >
                <input
                  type="checkbox"
                  checked={ribbonSpineLengthAwareOf(style)}
                  onChange={(e) => setStyle({ ribbonSpineLengthAware: e.target.checked })}
                />
                Length-aware spine
              </label>
              <Slider
                label="Shape subdiv"
                min={0}
                max={16}
                step={1}
                value={style.ribbonBorderSubdiv ?? 0}
                onChange={(v) => setStyle({ ribbonBorderSubdiv: Math.round(v) })}
                defaultValue={original?.ribbonBorderSubdiv ?? 0}
                tooltip="Vertices added between each pair of border-polyline vertices using a Catmull-Rom spline through the borders. Higher values round / smooth the silhouette (the original border vertices are preserved). 0 = shape vertices coincide with the spine offsets (low-poly look)."
              />
              <Slider
                label="Cap subdiv"
                min={1}
                max={32}
                step={1}
                value={ribbonCapSubdivOf(style)}
                onChange={(v) => setStyle({ ribbonCapSubdiv: Math.round(v) })}
                defaultValue={original ? ribbonCapSubdivOf(original) : ribbonCapSubdivOf(style)}
                tooltip="Round-cap fan steps per cap. Higher = smoother cap arc."
              />
              <Slider
                label="Broken anchor subdiv"
                min={0}
                max={8}
                step={1}
                value={style.ribbonBrokenAnchorSubdiv ?? 0}
                onChange={(v) => setStyle({ ribbonBrokenAnchorSubdiv: Math.round(v) })}
                defaultValue={original?.ribbonBrokenAnchorSubdiv ?? 0}
                tooltip="Extra spline1 samples added on each side of any broken-tangent (corner) anchor. Each iteration halves the gap between the anchor and the closest existing sample, so density grows geometrically toward the corner."
              />
            </>
          )}
          <Slider
            label="Vertex evenness"
            min={0}
            max={1}
            step={0.01}
            value={style.vertexEvenness ?? 0}
            onChange={(v) => setStyle({ vertexEvenness: v })}
            defaultValue={original?.vertexEvenness ?? 0}
            tooltip="Earcut only: re-distribute outline polygon vertices uniformly along the perimeter before triangulating. (Ribbon modes are uniform by construction — use Spine/Shape subdiv instead.)"
          />
          <Slider
            label="Relax curves"
            min={0}
            max={1}
            step={0.01}
            value={style.relaxCurves ?? 0}
            onChange={(v) => setStyle({ relaxCurves: v })}
            defaultValue={original?.relaxCurves ?? 0}
            tooltip="Laplacian smoothing pass over the rendered shape polygon. Each non-anchor vertex moves toward the midpoint of its two neighbors. Anchor positions are pinned. Aggressive at high values — collapses the polygon toward a polygon connecting the anchors."
          />
          <Slider
            label="Relax tangents"
            min={0}
            max={1}
            step={0.01}
            value={style.relaxTangents ?? 0}
            onChange={(v) => setStyle({ relaxTangents: v })}
            defaultValue={original?.relaxTangents ?? 0}
            tooltip="Equalizes edge lengths between consecutive non-anchor vertices by sliding each one toward the chord midpoint of its two neighbors. Removes perpendicular wobble and uneven tangent jumps caused by extreme width / world settings. Anchor positions stay pinned."
          />
        </Section>
      )}

      {show('spacing') && (
        <Section title="Spacing" reset={sectionReset('spacing')}>
          <Slider
            label="Tracking"
            min={-30}
            max={60}
            step={1}
            value={style.tracking ?? 0}
            onChange={(v) => setStyle({ tracking: v })}
            defaultValue={original?.tracking ?? 0}
            tooltip="Extra horizontal space added between every pair of glyphs (font units). Negative tightens, positive opens up."
          />
          <Slider
            label="Space width"
            min={0}
            max={200}
            step={1}
            value={style.spaceWidth ?? 56}
            onChange={(v) => setStyle({ spaceWidth: v })}
            defaultValue={original?.spaceWidth ?? 56}
            tooltip="Width of a literal space character (font units). Default ≈ 0.4× line height."
          />
          <Slider
            label="Line height"
            min={0.8}
            max={2.5}
            step={0.05}
            value={style.lineHeight ?? 1.2}
            onChange={(v) => setStyle({ lineHeight: v })}
            defaultValue={original?.lineHeight ?? 1.2}
            tooltip="Multiplier on the tallest glyph for vertical line stepping."
          />
        </Section>
      )}

      {EFFECT_SECTIONS.some(show) && (
        <BulkResetBar label="All effects" reset={allEffects} />
      )}

      {show('splineJitter') && (
        <Section title="Spline jitter" reset={sectionReset('splineJitter')}>
          <Slider
            label="Amount"
            min={0}
            max={20}
            step={0.1}
            value={style.effects?.splineJitter?.amount ?? 0}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  splineJitter: {
                    ...(style.effects?.splineJitter ?? { scope: 'instance', seed: 1 }),
                    amount: v,
                  },
                },
              })
            }
            defaultValue={0}
            tooltip="Random per-anchor displacement (font units) applied before stroke outlining. Each glyph instance gets its own offsets, so every set 'a' is slightly different."
          />
          <EffectScopePicker
            label="Scope"
            value={style.effects?.splineJitter?.scope ?? 'instance'}
            onChange={(scope) =>
              setStyle({
                effects: {
                  ...style.effects,
                  splineJitter: {
                    ...(style.effects?.splineJitter ?? { amount: 0, seed: 1 }),
                    scope,
                  },
                },
              })
            }
            tooltip="instance = each glyph occurrence different. glyph = every 'a' identical (but ≠ 'b'). text = one offset for everything."
            defaultValue={original?.effects?.splineJitter?.scope ?? 'instance'}
          />
        </Section>
      )}

      {show('shapeJitter') && (
        <Section title="Shape jitter" reset={sectionReset('shapeJitter')}>
          <Slider
            label="Amount"
            min={0}
            max={6}
            step={0.05}
            value={style.effects?.shapeJitter?.amount ?? 0}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  shapeJitter: {
                    ...(style.effects?.shapeJitter ?? { scope: 'instance', seed: 2 }),
                    amount: v,
                  },
                },
              })
            }
            defaultValue={0}
            tooltip="Random per-vertex displacement (font units) applied to the outline polygon — wobbly edges without changing the underlying spline."
          />
          <EffectScopePicker
            label="Scope"
            value={style.effects?.shapeJitter?.scope ?? 'instance'}
            onChange={(scope) =>
              setStyle({
                effects: {
                  ...style.effects,
                  shapeJitter: {
                    ...(style.effects?.shapeJitter ?? { amount: 0, seed: 2 }),
                    scope,
                  },
                },
              })
            }
            tooltip="instance = each glyph occurrence different. glyph = every 'a' identical (but ≠ 'b'). text = one offset for everything."
            defaultValue={original?.effects?.shapeJitter?.scope ?? 'instance'}
          />
        </Section>
      )}

      {show('widthWiggle') && (
        <Section title="Width wiggle" reset={sectionReset('widthWiggle')}>
          <Slider
            label="Amount"
            min={0}
            max={1}
            step={0.01}
            value={style.effects?.widthWiggle?.amount ?? 0}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthWiggle: {
                    ...(style.effects?.widthWiggle ?? { frequency: 0.05, scope: 'instance', seed: 3 }),
                    amount: v,
                  },
                },
              })
            }
            defaultValue={0}
            tooltip="Random multiplicative wobble of stroke width along the path. 0 = off; 1 = ±100% width swing."
          />
          <Slider
            label="Frequency"
            min={0.005}
            max={0.5}
            step={0.005}
            value={style.effects?.widthWiggle?.frequency ?? 0.05}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthWiggle: {
                    ...(style.effects?.widthWiggle ?? { amount: 0, scope: 'instance', seed: 3 }),
                    frequency: v,
                  },
                },
              })
            }
            defaultValue={0.05}
            tooltip="Cycles per font unit of arc length. Higher = tighter wobble."
          />
          <EffectScopePicker
            label="Scope"
            value={style.effects?.widthWiggle?.scope ?? 'instance'}
            onChange={(scope) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthWiggle: {
                    ...(style.effects?.widthWiggle ?? { amount: 0, frequency: 0.05, seed: 3 }),
                    scope,
                  },
                },
              })
            }
            tooltip="instance = each glyph occurrence different. glyph = every 'a' identical. text = one wobble pattern everywhere."
            defaultValue={original?.effects?.widthWiggle?.scope ?? 'instance'}
          />
        </Section>
      )}

      {show('widthTaper') && (
        <Section title="Width taper" reset={sectionReset('widthTaper')}>
          <Slider
            label="Start"
            min={0}
            max={2}
            step={0.01}
            value={style.effects?.widthTaper?.start ?? 1}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthTaper: {
                    ...(style.effects?.widthTaper ?? { end: 1, mode: 'stroke' }),
                    start: v,
                  },
                },
              })
            }
            defaultValue={1}
            tooltip="Width multiplier at the start of the stroke (or each taper period). 1 = no change."
          />
          <Slider
            label="End"
            min={0}
            max={2}
            step={0.01}
            value={style.effects?.widthTaper?.end ?? 1}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthTaper: {
                    ...(style.effects?.widthTaper ?? { start: 1, mode: 'stroke' }),
                    end: v,
                  },
                },
              })
            }
            defaultValue={1}
            tooltip="Width multiplier at the end of the stroke (or each taper period)."
          />
          <InlineSelect
            label="Mode"
            value={style.effects?.widthTaper?.mode ?? 'stroke'}
            onChange={(v) =>
              setStyle({
                effects: {
                  ...style.effects,
                  widthTaper: {
                    ...(style.effects?.widthTaper ?? { start: 1, end: 1 }),
                    mode: v as 'stroke' | 'length',
                  },
                },
              })
            }
            options={[
              { value: 'stroke', label: 'stroke' },
              { value: 'length', label: 'length' },
            ]}
            defaultValue={original?.effects?.widthTaper?.mode ?? 'stroke'}
            tooltip="Stroke = ramp spans the whole stroke, regardless of length. Length = ramp repeats every N font units (set below) so all strokes get the same physical taper period."
          />
          {style.effects?.widthTaper?.mode === 'length' && (
            <Slider
              label="Period"
              min={5}
              max={400}
              step={1}
              value={style.effects?.widthTaper?.length ?? 50}
              onChange={(v) =>
                setStyle({
                  effects: {
                    ...style.effects,
                    widthTaper: {
                      ...(style.effects!.widthTaper!),
                      length: v,
                    },
                  },
                })
              }
              defaultValue={50}
              tooltip="In length-mode, taper repeats every this many font units of arc length."
            />
          )}
        </Section>
      )}

      {show('randomness') && (
        <Section title="Randomness" reset={sectionReset('randomness')}>
          <Slider
            label="Effects seed"
            min={0}
            max={1024}
            step={1}
            value={style.effects?.splineJitter?.seed ?? 1}
            onChange={(v) => {
              const s = Math.round(v);
              setStyle({
                effects: {
                  ...style.effects,
                  splineJitter: {
                    ...(style.effects?.splineJitter ?? { amount: 0, scope: 'instance' }),
                    seed: s,
                  },
                  shapeJitter: {
                    ...(style.effects?.shapeJitter ?? { amount: 0, scope: 'instance' }),
                    seed: s + 1,
                  },
                },
              });
            }}
            defaultValue={1}
            tooltip="Re-roll the random pattern. Same seed always produces the same image."
          />
        </Section>
      )}
    </>
  );
}

// ---------- Layout primitives ----------------------------------------------

function BulkResetBar(props: {
  label: string;
  reset: { onClick: () => void; modified: boolean };
}): JSX.Element {
  const { label, reset } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 2px',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#555',
          flex: 1,
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={reset.onClick}
        disabled={!reset.modified}
        title={reset.modified ? `Reset ${label.toLowerCase()} to default` : 'Nothing to reset'}
        style={{
          border: '1px solid',
          borderColor: reset.modified ? '#c33' : '#ccc',
          background: 'transparent',
          color: reset.modified ? '#c33' : '#aaa',
          cursor: reset.modified ? 'pointer' : 'default',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        ↻ Reset {label.toLowerCase()}
      </button>
    </div>
  );
}

export function Section(props: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When set, header shows a reset button. `modified` controls its color. */
  reset?: { onClick: () => void; modified: boolean } | null;
}): JSX.Element {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const reset = props.reset ?? null;
  return (
    <section className="mz-section">
      <h3
        className="mz-section__title"
        onClick={() => setOpen((o) => !o)}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span aria-hidden style={{ fontSize: 10, width: 10, display: 'inline-block' }}>
          {open ? '▾' : '▸'}
        </span>
        <span style={{ flex: 1 }}>{props.title}</span>
        {reset && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reset.onClick();
            }}
            disabled={!reset.modified}
            title={reset.modified ? 'Reset all in this section' : 'Nothing to reset'}
            style={{
              border: 'none',
              background: 'transparent',
              color: reset.modified ? '#c33' : '#bbb',
              cursor: reset.modified ? 'pointer' : 'default',
              fontSize: 13,
              lineHeight: 1,
              padding: '0 2px',
            }}
          >
            ↻
          </button>
        )}
      </h3>
      {open && props.children}
    </section>
  );
}

type SelectOption = { value: string; label: string };

export function InlineSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly SelectOption[];
  tooltip?: string;
  defaultValue?: string;
}): JSX.Element {
  const modified =
    props.defaultValue !== undefined && props.value !== props.defaultValue;
  return (
    <label
      title={props.tooltip}
      className={modified ? 'mz-modified' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
    >
      <span style={{ width: 90, flexShrink: 0 }}>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ flex: 1, padding: '1px 4px', minWidth: 0 }}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Slider(props: {
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
      <span style={{ width: 90, flexShrink: 0, color: 'inherit' }}>
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
          width: 44,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: modified ? 'inherit' : 'var(--mz-text-mute)',
          padding: '1px 2px',
        }}
      />
    </label>
  );
}

type SimpleCap = 'round' | 'flat' | 'tapered';

function normalizeCap(c: CapShape): SimpleCap {
  return c === 'round' || c === 'flat' || c === 'tapered' ? c : 'round';
}

export function EffectScopePicker(props: {
  label: string;
  value: EffectScope;
  onChange: (v: EffectScope) => void;
  tooltip?: string;
  defaultValue?: EffectScope;
}): JSX.Element {
  const modified =
    props.defaultValue !== undefined && props.value !== props.defaultValue;
  return (
    <label
      title={props.tooltip}
      className={modified ? 'mz-modified' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
    >
      <span style={{ width: 90, flexShrink: 0 }}>{props.label}</span>
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

