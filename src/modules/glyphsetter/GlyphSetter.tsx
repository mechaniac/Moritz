/**
 * SVG-based glyph editor.
 *
 * Layout is a fixed 3-column shell (grid | canvas | inspector) so first-level
 * panels never re-flow when sub-controls change.
 *
 *   - Glyph grid (left, fixed width)        : pick the glyph to edit.
 *   - Canvas    (center, flex)              : draws + manipulates anchors and
 *                                             tangent handles.
 *   - Inspector (right, fixed width)        : view options, "Preview style"
 *                                             (live-edits the intrinsic
 *                                             `font.style`), and guides.
 *
 * Anchor positions and tangent handles are the ONLY per-glyph editable data
 * here. Everything else (caps, triangulation, ribbon density, etc.) lives in
 * `font.style` and is the typeface's intrinsic baseline.
 *
 * Pipeline order is glyphsetter â†’ stylesetter â†’ typesetter. The GlyphSetter
 * always renders from `font.style` directly; it deliberately ignores the
 * StyleSetter's overlay (`styleOverrides`). Edits made here are the new
 * baseline that StyleSetter and TypeSetter modulate downstream.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CObject } from '@christof/sigrid-geometry';
import { effectiveStyleForGlyph, outlineStroke, redistributePolygonEvenly, widthAt } from '../../core/stroke.js';
import {
  closestPointT,
  segmentLength,
  strokeToSegments,
  tangentAt,
  type CubicSegment,
} from '../../core/bezier.js';
import { triangulatePolygon } from '../../core/triangulate.js';
import { ribbonDebugSpline0, ribbonDebugSpline1, triangulateStrokeRibbon } from '../../core/ribbon.js';
import { relaxCurves, relaxSliderToParams, relaxTangents } from '../../core/relax.js';
import { makeWidthMod } from '../../core/widthEffects.js';
import { transformGlyph } from '../../core/transform.js';
import {
  jitterActive,
  jitterGlyphSpline,
  jitterPolygon,
  resolveJitterSeed,
} from '../../core/effects.js';
import { layout as layoutText } from '../../core/layout.js';
import type { GlyphViewOptions } from '../../state/store.js';
import { computeLayerGeometry } from './guides.js';
import { GuidesPanel } from './GuidesPanel.js';
import { measureFontMetrics, measureGlyphMetrics, measurePairAdvance } from './fontMetrics.js';
import { isPanGesture, useCanvasInput } from '../../ui/canvas/useCanvasInput.js';
import { useCanvasSize } from '../../ui/canvas/useCanvasSize.js';
import {
  addStroke,
  clearNormalOverride,
  cloneStroke,
  deleteAnchor,
  deleteStroke,
  flipStrokeHorizontal,
  flipStrokeVertical,
  insertAnchor,
  makeCorner,
  makeSmooth,
  moveAnchor,
  moveHandle,
  pasteStrokes,
  setBreakTangent,
  setNormalOverride,
  strokeAnchorBBox,
  translateStroke,
} from '../../core/glyphOps.js';
import {
  ribbonCapSubdivOf,
  ribbonSpineLengthAwareOf,
  ribbonSpineSubdivOf,
  type Font,
  type Glyph,
  type GlyphAnimatorComponent,
  type Stroke,
  type StyleSettings,
  type Vec2,
  type Vertex,
  type WidthProfile,
} from '../../core/types.js';
import { animateGlyphWithAnimator } from '../../core/glyphAnimator.js';
import {
  moritzGlyphCObjectId,
  moritzGlyphCObjectMetaFromId,
  moritzGlyphCObjectSelection,
  moritzGlyphObjectSelectionFromCObjectId,
  type GlyphObjectSelection,
  type MoritzCObjectMeta,
  type MoritzGlyphCObjectSelection,
} from '../../core/moritzCObjects.js';
import type { GuideSettings } from './guides.js';
import { useAppStore } from '../../state/store.js';
import { StyleControls } from '../stylesetter/StyleControls.js';
import { MoritzLabel } from '../../ui/MoritzText.js';
import { MoritzSelect } from '../../ui/MoritzSelect.js';
import { MgLeftBar, MgRightBar, MgCOptions, MgOutliner, useMgElement, type MgTreeNode } from '@christof/magdalena/react';

// Module-level clipboard for copied strokes. Persists across glyph switches
// (the GlyphEditor remounts when `selectedGlyph` changes) and even module
// switches, so the user can copy from one glyph and paste into another.
// Held as already-cloned strokes so a future edit of the source doesn't
// mutate the clipboard contents. `sourceCenter` is the box-center of the
// glyph the strokes were copied from, in font units; on paste we shift
// each stroke by (target.center - source.center) so the artwork keeps the
// SAME position relative to the box centre regardless of differing widths.
let strokeClipboard:
  | { strokes: readonly Stroke[]; sourceCenter: { x: number; y: number } }
  | null = null;

// Editor zoom range used by both the slider and the wheel/pinch handlers.
const MIN_EDITOR_SCALE = 1;
const MAX_EDITOR_SCALE = 30;

// Reference frame inside the glyph editor â€” a fixed square the user can
// always see, so adjustments to a glyph's own box read as deviations from
// this default. Picked to match defaultFont's BOX_H (140) so most glyphs
// fit naturally inside it.
const DEFAULT_BOX = 140;

/**
 * Apply reference-font metrics (advance + side bearings) to a glyph.
 * Pure helper: vertical scale is `g.box.h / (ascent + descent)` so the
 * imported width matches the rendered reference glyph in the editor.
 * Existing strokes are shifted by half the box-width delta so artwork
 * stays visually centred. Returns the glyph unchanged if no metrics are
 * available (font not loaded, missing glyph, etc.).
 */
function importGlyphMetrics(g: Glyph, char: string, family: string): Glyph {
  if (!family) return g;
  const fm = measureFontMetrics(family);
  const gm = measureGlyphMetrics(family, char);
  if (!gm) return g;
  const emToUnits = g.box.h / Math.max(1e-6, fm.ascent + fm.descent);
  const newW = Math.max(1, Math.round(gm.advance * emToUnits));
  const lsb = Math.round(gm.leftBearing * emToUnits);
  const rsb = Math.round(gm.rightBearing * emToUnits);
  const dx = (newW - g.box.w) / 2;
  const strokes = dx === 0
    ? g.strokes
    : g.strokes.map((s) => ({
        ...s,
        vertices: s.vertices.map((vx) => ({
          ...vx,
          p: { x: vx.p.x + dx, y: vx.p.y },
        })),
      }));
  return {
    ...g,
    box: { ...g.box, w: newW },
    sidebearings: { left: lsb, right: rsb },
    strokes,
  };
}

/**
 * Extract kerning pairs from a CSS reference font for every ordered pair of
 * glyphs the Moritz font already has. For each (a, b) we measure the
 * pair advance and subtract the sum of single advances; the leftover is
 * the kerning the reference font applies, converted to Moritz font units
 * via the same emâ†’units scale `importGlyphMetrics` uses (driven by the
 * target glyph's `box.h`).
 *
 * Returns a flat `Record<a+b, delta-in-units>`. Pairs whose absolute
 * delta falls below `threshold` (in font units) are omitted to keep
 * the table sparse â€” most Latin pairs have zero kerning in most fonts.
 */
function extractKerningFromReference(
  font: Font,
  family: string,
  threshold = 0.5,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!family) return out;
  const fm = measureFontMetrics(family);
  const emDen = Math.max(1e-6, fm.ascent + fm.descent);
  const chars = Object.keys(font.glyphs);
  for (const a of chars) {
    const ga = font.glyphs[a];
    if (!ga) continue;
    const ma = measureGlyphMetrics(family, a);
    if (!ma) continue;
    for (const b of chars) {
      const gb = font.glyphs[b];
      if (!gb) continue;
      const mb = measureGlyphMetrics(family, b);
      if (!mb) continue;
      const pair = measurePairAdvance(family, a, b);
      if (pair == null) continue;
      const deltaEm = pair - (ma.advance + mb.advance);
      // Use the average of both glyphs' box heights as the emâ†’units scale,
      // so a kerning delta written here will be applied at the same visual
      // size as the imported per-glyph advances.
      const emToUnits = ((ga.box.h + gb.box.h) / 2) / emDen;
      const delta = deltaEm * emToUnits;
      if (Math.abs(delta) >= threshold) {
        out[a + b] = Math.round(delta);
      }
    }
  }
  return out;
}

export type Selection = GlyphObjectSelection;

type Drag =
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'handle'; strokeIdx: number; vIdx: number; side: 'in' | 'out' }
  | { kind: 'normal'; strokeIdx: number; vIdx: number }
  | { kind: 'stroke'; strokeIdx: number; lastX: number; lastY: number; moved: boolean }
  | { kind: 'multi'; strokeIdxs: readonly number[]; lastX: number; lastY: number }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number }
  | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanY: number };

export function GlyphSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const cObjectSelection = useMemo(
    () => moritzGlyphCObjectSelection(font, selectedChar, selection),
    [font, selectedChar, selection],
  );
  useEffect(() => {
    setSelection({ kind: 'none' });
  }, [selectedChar]);

  return (
    <>
      <GlyphSetterStage
        selection={selection}
        onSelectionChange={setSelection}
      />
      <MgLeftBar
        id="moritz.outliner"
        title="Glyphs"
      >
        <GlyphSetterOutliner
          cObjectSelection={cObjectSelection}
          onSelectionChange={setSelection}
        />
      </MgLeftBar>
      {cObjectSelection.selected ? (
        <MgCOptions
          id="moritz.itemattrs"
          title={cObjectSelection.meta?.label}
        >
          <GlyphSetterItemAttrs
            cObjectSelection={cObjectSelection}
            onSelectionChange={setSelection}
          />
        </MgCOptions>
      ) : null}
      <MgRightBar
        id="moritz.attrs"
        title="Style"
      >
        <GlyphSetterAttrs />
      </MgRightBar>
    </>
  );
}

export function GlyphSetterStage(props: {
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
}): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const updateSelectedGlyph = useAppStore((s) => s.updateSelectedGlyph);
  const view = useAppStore((s) => s.glyphView);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  const glyph = font.glyphs[selectedChar];
  return (
    <div
      className="mz-glyphsetter mz-glyphsetter--mg"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="mz-glyphsetter__editor"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {glyph ? (
          <GlyphEditor
            char={selectedChar}
            glyph={glyph}
            onChange={updateSelectedGlyph}
            view={view}
            setView={setGlyphView}
            font={font}
            selection={props.selection}
            onSelectionChange={props.onSelectionChange}
          />
        ) : (
          <p style={{ padding: 16 }}>No glyph selected.</p>
        )}
      </div>
    </div>
  );
}

export function GlyphSetterOutliner(props: {
  cObjectSelection: MoritzGlyphCObjectSelection;
  onSelectionChange: (selection: Selection) => void;
}): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const selectGlyph = useAppStore((s) => s.selectGlyph);
  const view = useAppStore((s) => s.glyphView);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  const setFontGuides = useAppStore((s) => s.setFontGuides);
  const setKerning = useAppStore((s) => s.setKerning);
  const leftTab = useAppStore((s) => s.glyphsetterTab);
  const setLeftTab = useAppStore((s) => s.setGlyphsetterTab);
  return (
    <>
      <LeftTabBar value={leftTab} onChange={setLeftTab} />
      <div style={{ marginTop: 'calc(var(--mg-pad) * 0.5)' }}>
        {leftTab === 'glyphs' ? (
          <>
            <GlyphGrid
              chars={Object.keys(font.glyphs)}
              selected={selectedChar}
              onSelect={selectGlyph}
              font={font}
              view={view}
            />
            <GlyphCObjectOutliner
              font={font}
              selectedChar={selectedChar}
              cObjectSelection={props.cObjectSelection}
              onSelectionChange={props.onSelectionChange}
            />
          </>
        ) : leftTab === 'kerning' ? (
          <KerningList
            font={font}
            pairs={font.kerning ?? {}}
            onChange={setKerning}
            refFontFamily={view.refFontFamily}
          />
        ) : (
          <SettingsPanel
            view={view}
            setView={setGlyphView}
            setFontGuides={setFontGuides}
          />
        )}
      </div>
    </>
  );
}

export function GlyphSetterAttrs(): JSX.Element {
  const setStyleOverride = useAppStore((s) => s.setStyleOverride);
  const style = useAppStore((s) => s.style);
  const loadedStyleSettings = useAppStore((s) => s.loadedStyleSettings);
  return (
    <div className="mz-mod--stylesetter">
      <StyleControls
        style={style}
        setStyle={setStyleOverride}
        {...(loadedStyleSettings ? { original: loadedStyleSettings } : {})}
      />
    </div>
  );
}

/** Per-item attributes panel in the cOptions region. */
export function GlyphSetterItemAttrs(props: {
  cObjectSelection: MoritzGlyphCObjectSelection;
  onSelectionChange: (selection: Selection) => void;
}): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const view = useAppStore((s) => s.glyphView);
  const updateSelectedGlyph = useAppStore((s) => s.updateSelectedGlyph);
  const updateAllGlyphs = useAppStore((s) => s.updateAllGlyphs);
  const glyph = font.glyphs[selectedChar];
  if (!glyph) return <p style={{ color: 'var(--mz-text-mute)', fontSize: 12 }}>No glyph selected.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <CObjectSelectionHeader meta={props.cObjectSelection.meta} />
      {props.cObjectSelection.meta?.role === 'anchor' ? (
        <AnchorInstancePanel
          glyph={glyph}
          meta={props.cObjectSelection.meta}
          updateGlyph={updateSelectedGlyph}
        />
      ) : props.cObjectSelection.meta?.role === 'stroke' ? (
        <StrokeInstancePanel
          glyph={glyph}
          meta={props.cObjectSelection.meta}
        />
      ) : props.cObjectSelection.meta?.role === 'multi' ? (
        <MultiStrokePanel meta={props.cObjectSelection.meta} />
      ) : props.cObjectSelection.meta?.role === 'animator' ? (
        <AnimatorInstancePanel
          glyph={glyph}
          updateGlyph={updateSelectedGlyph}
          onSelectionChange={props.onSelectionChange}
        />
      ) : (
        <GlyphMetricsPanel
          glyph={glyph}
          view={view}
          updateGlyph={updateSelectedGlyph}
          updateAllGlyphs={updateAllGlyphs}
          onSelectAnimator={() => props.onSelectionChange({ kind: 'animator' })}
        />
      )}
    </div>
  );
}

function CObjectSelectionHeader(props: {
  meta: MoritzCObjectMeta | null;
}): JSX.Element | null {
  if (!props.meta) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        paddingBottom: 4,
        borderBottom: '1px solid var(--mz-line)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--mz-text)',
        }}
      >
        <MoritzLabel text={props.meta.label} size={11} />
      </span>
      <span
        style={{
          fontSize: 10,
          color: 'var(--mz-text-faint)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={props.meta.id}
      >
        <MoritzLabel text={selectionRoleLabel(props.meta.role)} size={10} />
      </span>
    </div>
  );
}

function selectionRoleLabel(role: MoritzCObjectMeta['role']): string {
  switch (role) {
    case 'glyph':
      return 'Glyph selection';
    case 'animator':
      return 'Animator component';
    case 'stroke':
      return 'Stroke selection';
    case 'anchor':
      return 'Anchor selection';
    case 'multi':
      return 'Multi-stroke selection';
    case 'font':
      return 'Font selection';
    case 'handle':
      return 'Handle selection';
    default:
      return 'Object selection';
  }
}

function AnchorInstancePanel(props: {
  glyph: Glyph;
  meta: MoritzCObjectMeta;
  updateGlyph: (fn: (g: Glyph) => Glyph) => void;
}): JSX.Element {
  const strokeIdx = props.meta.strokeIdx ?? -1;
  const vIdx = props.meta.vIdx ?? -1;
  const anchor = props.glyph.strokes[strokeIdx]?.vertices[vIdx];
  if (!anchor) {
    return <p style={{ color: 'var(--mz-text-mute)', fontSize: 12 }}>Anchor no longer exists.</p>;
  }
  const updateAnchor = (fn: (anchor: Vertex) => Vertex): void => {
    props.updateGlyph((glyph) => {
      const stroke = glyph.strokes[strokeIdx];
      if (!stroke || !stroke.vertices[vIdx]) return glyph;
      return {
        ...glyph,
        strokes: glyph.strokes.map((s, si) =>
          si === strokeIdx
            ? {
                ...s,
                vertices: s.vertices.map((v, vi) => (vi === vIdx ? fn(v) : v)),
              }
            : s,
        ),
      };
    });
  };
  const coordRange = Math.max(props.glyph.box.w, props.glyph.box.h, 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <NumSlider
        label="X"
        min={-coordRange}
        max={props.glyph.box.w + coordRange}
        step={1}
        value={anchor.p.x}
        onChange={(x) => updateAnchor((v) => ({ ...v, p: { ...v.p, x } }))}
      />
      <NumSlider
        label="Y"
        min={-coordRange}
        max={props.glyph.box.h + coordRange}
        step={1}
        value={anchor.p.y}
        onChange={(y) => updateAnchor((v) => ({ ...v, p: { ...v.p, y } }))}
      />
      <NumSlider
        label="In X"
        min={-coordRange}
        max={coordRange}
        step={1}
        value={anchor.inHandle.x}
        onChange={(x) => updateAnchor((v) => ({ ...v, inHandle: { ...v.inHandle, x } }))}
      />
      <NumSlider
        label="In Y"
        min={-coordRange}
        max={coordRange}
        step={1}
        value={anchor.inHandle.y}
        onChange={(y) => updateAnchor((v) => ({ ...v, inHandle: { ...v.inHandle, y } }))}
      />
      <NumSlider
        label="Out X"
        min={-coordRange}
        max={coordRange}
        step={1}
        value={anchor.outHandle.x}
        onChange={(x) => updateAnchor((v) => ({ ...v, outHandle: { ...v.outHandle, x } }))}
      />
      <NumSlider
        label="Out Y"
        min={-coordRange}
        max={coordRange}
        step={1}
        value={anchor.outHandle.y}
        onChange={(y) => updateAnchor((v) => ({ ...v, outHandle: { ...v.outHandle, y } }))}
      />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--mz-text-mute)',
        }}
      >
        <input
          type="checkbox"
          checked={anchor.breakTangent === true}
          onChange={(e) => updateAnchor((v) => ({ ...v, breakTangent: e.target.checked }))}
        />
        <MoritzLabel text="Break tangent" size={11} />
      </label>
    </div>
  );
}

function StrokeInstancePanel(props: {
  glyph: Glyph;
  meta: MoritzCObjectMeta;
}): JSX.Element {
  const strokeIdx = props.meta.strokeIdx ?? -1;
  const stroke = props.glyph.strokes[strokeIdx];
  if (!stroke) {
    return <p style={{ color: 'var(--mz-text-mute)', fontSize: 12 }}>Stroke no longer exists.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <div style={{ color: 'var(--mz-text-mute)' }}>
        <MoritzLabel text={`Anchors ${stroke.vertices.length}`} size={12} />
      </div>
    </div>
  );
}

function MultiStrokePanel(props: {
  meta: MoritzCObjectMeta;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <div style={{ color: 'var(--mz-text-mute)' }}>
        <MoritzLabel text={`Selected strokes ${props.meta.selectedIds?.length ?? 0}`} size={12} />
      </div>
    </div>
  );
}

function AnimatorInstancePanel(props: {
  glyph: Glyph;
  updateGlyph: (fn: (g: Glyph) => Glyph) => void;
  onSelectionChange: (selection: Selection) => void;
}): JSX.Element {
  const animator = props.glyph.animator;
  if (!animator) {
    return (
      <p style={{ color: 'var(--mz-text-mute)', fontSize: 12 }}>
        <MoritzLabel text="No animator" size={12} />
      </p>
    );
  }
  const updateAnimator = (fn: (animator: GlyphAnimatorComponent) => GlyphAnimatorComponent): void => {
    props.updateGlyph((glyph) => {
      if (!glyph.animator) return glyph;
      return { ...glyph, animator: fn(glyph.animator) };
    });
  };
  const symbolText = animator.symbols.map((symbol) => symbol.id).join(', ');
  const selectedStrokeId =
    animator.strokeIds && animator.strokeIds.length === 1 ? animator.strokeIds[0] : '';
  const strokeOptions = [
    { value: '', label: 'All strokes' },
    ...props.glyph.strokes.map((stroke, index) => ({
      value: stroke.id,
      label: `Stroke ${index + 1}`,
    })),
  ];
  const easingOptions = [
    { value: 'linear', label: 'Linear' },
    { value: 'smoothstep', label: 'Smoothstep' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--mz-text-mute)' }}>
          <MoritzLabel text="Symbols" size={11} />
        </span>
        <input
          value={symbolText}
          onChange={(event) => {
            const symbols = event.target.value
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
              .map((id) => ({ id }));
            updateAnimator((cur) => ({ ...cur, symbols }));
          }}
          style={{
            minWidth: 0,
            padding: '2px 4px',
            background: 'var(--mz-bg)',
            color: 'var(--mz-text)',
            border: '1px solid var(--mz-line)',
            borderRadius: 4,
          }}
        />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--mz-text-mute)' }}>
          <MoritzLabel text="Stroke" size={11} />
        </span>
        <MoritzSelect
          value={selectedStrokeId ?? ''}
          options={strokeOptions}
          onChange={(strokeId) => {
            updateAnimator((cur) => ({
              ...cur,
              strokeIds: strokeId ? [strokeId] : undefined,
            }));
          }}
          style={{ minWidth: 0 }}
        />
      </div>
      <NumSlider
        label="Phase"
        min={-1}
        max={1}
        step={0.01}
        value={animator.phase ?? 0}
        onChange={(phase) => updateAnimator((cur) => ({ ...cur, phase }))}
      />
      <NumSlider
        label="Speed"
        min={-2}
        max={2}
        step={0.01}
        value={animator.speed ?? 0}
        onChange={(speed) => updateAnimator((cur) => ({ ...cur, speed }))}
      />
      <NumSlider
        label="Spacing"
        min={0}
        max={1}
        step={0.01}
        value={animator.spacing ?? 0}
        onChange={(spacing) => updateAnimator((cur) => ({ ...cur, spacing }))}
      />
      <NumSlider
        label="Samples"
        min={2}
        max={64}
        step={1}
        value={animator.samplesPerSegment ?? 16}
        onChange={(samplesPerSegment) =>
          updateAnimator((cur) => ({
            ...cur,
            samplesPerSegment: Math.max(2, Math.round(samplesPerSegment)),
          }))
        }
      />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--mz-text-mute)',
        }}
      >
        <input
          type="checkbox"
          checked={animator.loop === true}
          onChange={(event) => updateAnimator((cur) => ({ ...cur, loop: event.target.checked }))}
        />
        <MoritzLabel text="Loop" size={11} />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--mz-text-mute)' }}>
          <MoritzLabel text="Easing" size={11} />
        </span>
        <MoritzSelect
          value={animator.easing ?? 'linear'}
          options={easingOptions}
          onChange={(value) =>
            updateAnimator((cur) => ({
              ...cur,
              easing: value === 'smoothstep' ? 'smoothstep' : 'linear',
            }))
          }
          style={{ minWidth: 0 }}
        />
      </div>
      <button
        type="button"
        aria-label="Remove animator"
        title="Remove the animator component from this glyph."
        onClick={() => {
          props.updateGlyph((glyph) => {
            const { animator: _animator, ...rest } = glyph;
            return rest;
          });
          props.onSelectionChange({ kind: 'none' });
        }}
      >
        <MoritzLabel text="Remove animator" size={12} />
      </button>
    </div>
  );
}

// ---------- Sidebar: glyph grid --------------------------------------------

function GlyphCObjectOutliner(props: {
  font: Font;
  selectedChar: string;
  cObjectSelection: MoritzGlyphCObjectSelection;
  onSelectionChange: (selection: Selection) => void;
}): JSX.Element | null {
  const nodes = useMemo(() => {
    const root = props.cObjectSelection.root;
    if (!root) return [];
    const glyphId = moritzGlyphCObjectId(props.font.id, props.selectedChar);
    const glyphNode = root.children.find((node) => node.id === glyphId);
    return glyphNode
      ? [cObjectToMgTreeNode(props.font, props.selectedChar, glyphNode)]
      : [];
  }, [props.cObjectSelection.root, props.font, props.selectedChar]);

  if (nodes.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid var(--mz-line)',
      }}
    >
      <MgOutliner
        nodes={nodes}
        selectedId={props.cObjectSelection.selected?.id ?? null}
        onSelect={(id) =>
          props.onSelectionChange(
            moritzGlyphObjectSelectionFromCObjectId(props.font, props.selectedChar, id),
          )
        }
      />
    </div>
  );
}

function cObjectToMgTreeNode(font: Font, selectedChar: string, node: CObject): MgTreeNode {
  const meta = moritzGlyphCObjectMetaFromId(font, selectedChar, node.id);
  return {
    id: node.id,
    label: meta?.label ?? cObjectFallbackLabel(node.id),
    kind: meta?.role ?? node.kind,
    selected: node.selected === true,
    tone: meta?.role === 'glyph' ? 'relevant' : meta?.role === 'animator' ? 'generate' : 'neutral',
    importance: node.selected ? 5 : meta?.role === 'glyph' ? 3 : 1,
    ...(node.children.length > 0
      ? { children: node.children.map((child) => cObjectToMgTreeNode(font, selectedChar, child)) }
      : {}),
  };
}

function cObjectFallbackLabel(id: string): string {
  const parts = id.split('.');
  const tail = parts[parts.length - 1];
  return tail ? tail : id;
}

/** Pixels per font unit in the grid thumbnails. Fixed so all glyphs render at
 *  the same zoom level â€” the grid wraps and tiles take their natural size. */
const GRID_PX_PER_UNIT = 0.35;

function GlyphGrid(props: {
  chars: string[];
  selected: string;
  onSelect: (c: string) => void;
  font: Font;
  view: GlyphViewOptions;
}): JSX.Element {
  return (
    <aside
      className="mz-glyphsetter__grid"
      style={{
        width: '100%',
        padding: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        className="mz-glyph-grid"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 4,
        }}
      >
        {props.chars.map((c) => {
          const g = props.font.glyphs[c]!;
          const active = c === props.selected;
          // True-to-scale pixel dimensions; +2px padding inside button.
          const w = g.box.w * GRID_PX_PER_UNIT;
          const h = g.box.h * GRID_PX_PER_UNIT;
          return (
            <div
              key={c}
              className="mz-glyph-cell"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                flex: '0 0 auto',
              }}
            >
              <button
                className={`mz-glyph-thumb${active ? ' mz-glyph-thumb--active' : ''}`}
                data-char={c}
                onClick={() => props.onSelect(c)}
                title={c}
                style={{
                  width: w + 4,
                  background: 'var(--mz-paper)',
                  color: 'var(--mz-ink)',
                  border: `1px solid ${active ? 'var(--mz-accent)' : 'var(--mz-line)'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'block',
                  boxShadow: active ? '0 0 0 1px var(--mz-accent) inset' : 'none',
                }}
              >
                <div style={{ width: w, height: h }}>
                  <ThumbSvg glyph={g} font={props.font} view={props.view} />
                </div>
              </button>
              <div
                className="mz-glyph-cell__label"
                style={{
                  fontSize: 9,
                  lineHeight: 1,
                  color: 'var(--mz-text-faint)',
                  fontFamily: 'monospace',
                }}
              >
                {c}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ThumbSvg(props: {
  glyph: Glyph;
  font: Font;
  view: GlyphViewOptions;
}): JSX.Element {
  const { glyph, font } = props;
  const gStyle = useMemo(() => effectiveStyleForGlyph(font.style, glyph), [font.style, glyph]);
  const display = useMemo(
    () => previewGlyph(glyph, font.style, { instanceIndex: 0, char: glyph.char }),
    [glyph, font.style],
  );
  const paths = useMemo(
    () =>
      display.strokes.map((s, i) => {
        const { polygon, triangles } = triangulateForStyle(s, gStyle, {
          instanceIndex: i,
          char: glyph.char,
        }, glyph.box.h);
        return trianglesD(polygon, triangles);
      }),
    [display, gStyle, glyph.char, glyph.box.h],
  );
  return (
    <svg
      viewBox={`0 0 ${glyph.box.w} ${glyph.box.h}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="var(--mz-ink)">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ---------- Editor (canvas column) -----------------------------------------

export function GlyphEditor(props: {
  char: string;
  glyph: Glyph;
  onChange: (fn: (g: Glyph) => Glyph) => void;
  view: GlyphViewOptions;
  setView: (patch: Partial<GlyphViewOptions>) => void;
  font: Font;
  selection?: Selection;
  onSelectionChange?: (selection: Selection) => void;
  /** Extra toolbar slot (e.g. BubbleSetter's "Fill" button). Rendered
   *  inline at the right end of the toolbar, before the help button. */
  extraToolbar?: React.ReactNode;
  /** Optional SVG nodes drawn in glyph coordinates underneath the
   *  editable strokes (BubbleSetter uses this to show siblings + dummy
   *  text). Pointer events are disabled by the editor wrapper.
   *
   *  When `world` is provided, the underlay is instead drawn in **world
   *  coordinates** (so it stays put when switching layers).
   */
  underlay?: React.ReactNode;
  /** Optional "open Illustrator file" mode: the editor canvas shows a
   *  fixed world-coord box (e.g. the bubble), the edited glyph is
   *  positioned inside that world via `(tx, ty, s)`, and the underlay
   *  is rendered in world coords. Switching layers only changes
   *  `(tx, ty, s)` â€” the world box, pan and zoom stay anchored, so the
   *  view does not jump. The default-box / glyph-box reference rects
   *  are hidden (they relate to a single glyph, not the world). */
  world?: {
    box: { w: number; h: number };
    /** Glyph (0,0) sits at world (tx, ty); 1 glyph unit = `s` world units. */
    tx: number;
    ty: number;
    s: number;
    /** Spacing of the horizontal lined-paper grid, in world units. When
     *  omitted the grid falls back to font-line-height Ã— glyph-box-h. */
    lineHeight?: number;
  };
}): JSX.Element {
  const { char, glyph, onChange, view, font, extraToolbar } = props;
  const [localSelection, setLocalSelection] = useState<Selection>({ kind: 'none' });
  const selection = props.selection ?? localSelection;
  const setSelection = useCallback(
    (next: Selection) => {
      if (props.onSelectionChange) props.onSelectionChange(next);
      else setLocalSelection(next);
    },
    [props.onSelectionChange],
  );
  // Live marquee rectangle while the user drags from empty canvas. In
  // glyph-coord units; null when not marqueeing. Kept in React state so
  // the visualization re-renders each frame.
  const [marquee, setMarquee] = useState<
    { x1: number; y1: number; x2: number; y2: number } | null
  >(null);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // The SVG fills the entire canvas area (Illustrator-style infinite
  // workspace). We measure the wrapper with the shared canvas-shell
  // hook and centre the glyph inside whatever space the user gave us.
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useCanvasSize(wrapRef);

  // Glyph as it would render in the StyleSetter / TypeSetter, i.e. with the
  // style's affine (slant, scaleX, scaleY) and per-glyph spline jitter
  // applied. The raw `glyph` is still used for editing handles / hit
  // testing â€” only the visual previews (fill, debug border, triangulation
  // overlay) use this transformed copy so the user sees the final look.
  const displayGlyph = useMemo(
    () => previewGlyph(glyph, font.style, { instanceIndex: 0, char }),
    [glyph, font.style, char],
  );
  const gStyle = useMemo(() => effectiveStyleForGlyph(font.style, glyph), [font.style, glyph]);
  const [animatorTime, setAnimatorTime] = useState(0);
  useEffect(() => {
    if (!glyph.animator) {
      setAnimatorTime(0);
      return;
    }
    let frame = 0;
    let lastPaint = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      if (now - lastPaint >= 33) {
        setAnimatorTime((now - start) / 1000);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [glyph.animator]);
  const animatorFrames = useMemo(
    () =>
      glyph.animator
        ? animateGlyphWithAnimator(glyph, glyph.animator, { time: animatorTime })
            .animations.flatMap((animation) =>
              animation.frames
                .filter((frame) => frame.visible)
                .map((frame) => ({ ...frame, strokeId: animation.strokeId })),
            )
        : [],
    [glyph, animatorTime],
  );

  // SVG fills the wrapper; the glyph is centred inside that. The wrapper
  // can be any size, including much larger than the glyph itself, so the
  // user always has free workspace around the artwork.
  const viewW = Math.max(size.w, 1);
  const viewH = Math.max(size.h, 1);

  // The glyph's strokes are anchored to the glyph's own box (so the artwork
  // always sits inside the solid rectangle in the editor â€” same as the grid
  // and the StyleSetter preview). The default-box outline is a separate
  // reference frame, drawn centred on the canvas for orientation.
  // World-space model: the canvas is a window onto a world rectangle.
  // In plain glyph editing the world IS the glyph (box, tx=ty=0, s=1)
  // so this collapses to the previous behaviour. In BubbleSetter the
  // world is the bubble; the edited glyph is placed inside it via
  // (tx, ty, s). Pan + zoom act on the world, so they stay anchored
  // when the user switches layers.
  const worldBoxW = props.world?.box.w ?? glyph.box.w;
  const worldBoxH = props.world?.box.h ?? glyph.box.h;
  const worldTx = props.world?.tx ?? 0;
  const worldTy = props.world?.ty ?? 0;
  const worldGlyphS = props.world?.s ?? 1;
  const worldS = view.editorScale; // px per world unit
  const cx = viewW / 2 + (view.panX ?? 0);
  const cy = viewH / 2 + (view.panY ?? 0);
  const worldOriginX = cx - (worldBoxW * worldS) / 2;
  const worldOriginY = cy - (worldBoxH * worldS) / 2;
  const SCALE = worldS * worldGlyphS; // px per glyph unit
  const originX = worldOriginX + worldTx * worldS; // glyph (0,0) on screen
  const originY = worldOriginY + worldTy * worldS;
  const gBoxX = originX;
  const gBoxY = originY;
  const defBoxX = cx - (DEFAULT_BOX * SCALE) / 2;
  const defBoxY = cy - (DEFAULT_BOX * SCALE) / 2;
  const xform = `translate(${originX} ${originY}) scale(${SCALE})`;
  // Underlay transform: world coords when in world mode, glyph coords
  // otherwise (BubbleSetter passes its underlay in bubble-coords; the
  // GlyphSetter has no underlay, so this branch is moot for it).
  const underlayXform = props.world
    ? `translate(${worldOriginX} ${worldOriginY}) scale(${worldS})`
    : xform;

  const toGlyph = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const local = pt.matrixTransform(ctm.inverse());
      return {
        x: (local.x - originX) / SCALE,
        y: (local.y - originY) / SCALE,
      };
    },
    [SCALE, originX, originY],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      // Pan moves the artwork by raw screen-pixel delta â€” no glyph-coord
      // conversion (we *change* the origin, so converting now would
      // chase its own tail).
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      props.setView({ panX: drag.startPanX + dx, panY: drag.startPanY + dy });
      return;
    }
    const p = toGlyph(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'anchor') {
      onChange((g) => moveAnchor(g, drag.strokeIdx, drag.vIdx, p));
    } else if (drag.kind === 'handle') {
      onChange((g) => moveHandle(g, drag.strokeIdx, drag.vIdx, drag.side, p));
    } else if (drag.kind === 'normal') {
      onChange((g) => setNormalOverride(g, drag.strokeIdx, drag.vIdx, p));
    } else if (drag.kind === 'marquee') {
      drag.curX = p.x;
      drag.curY = p.y;
      setMarquee({ x1: drag.startX, y1: drag.startY, x2: p.x, y2: p.y });
    } else if (drag.kind === 'multi') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = p.x;
      drag.lastY = p.y;
      const idxs = drag.strokeIdxs;
      onChange((g) =>
        idxs.reduce((acc, i) => translateStroke(acc, i, dx, dy), g),
      );
    } else {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = p.x;
      drag.lastY = p.y;
      drag.moved = true;
      onChange((g) => translateStroke(g, drag.strokeIdx, dx, dy));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (drag.kind === 'marquee') {
      const minX = Math.min(drag.startX, drag.curX);
      const maxX = Math.max(drag.startX, drag.curX);
      const minY = Math.min(drag.startY, drag.curY);
      const maxY = Math.max(drag.startY, drag.curY);
      // Treat tiny zero-area drags as a plain background click â†’ deselect.
      const TINY = 1; // glyph units
      if (maxX - minX < TINY && maxY - minY < TINY) {
        setSelection({ kind: 'none' });
      } else {
        const hits: number[] = [];
        for (let i = 0; i < glyph.strokes.length; i++) {
          const bb = strokeAnchorBBox(glyph.strokes[i]!);
          // AABB intersection (inclusive) â€” pick a stroke if its anchor
          // bbox overlaps the marquee at all.
          if (
            bb.maxX >= minX && bb.minX <= maxX &&
            bb.maxY >= minY && bb.minY <= maxY
          ) {
            hits.push(i);
          }
        }
        if (hits.length === 0) setSelection({ kind: 'none' });
        else if (hits.length === 1) setSelection({ kind: 'stroke', strokeIdx: hits[0]! });
        else setSelection({ kind: 'multi', strokeIdxs: hits });
      }
      setMarquee(null);
    }
    dragRef.current = null;
  };

  const startAnchorDrag = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    if (e.altKey) {
      // Alt-click an anchor toggles corner <-> smooth.
      const v = glyph.strokes[strokeIdx]?.vertices[vIdx];
      if (!v) return;
      const isCorner =
        v.inHandle.x === 0 && v.inHandle.y === 0 &&
        v.outHandle.x === 0 && v.outHandle.y === 0;
      onChange((g) =>
        isCorner
          ? makeSmooth(g, strokeIdx, vIdx)
          : makeCorner(g, strokeIdx, vIdx),
      );
      setSelection({ kind: 'anchor', strokeIdx, vIdx });
      return;
    }
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'anchor', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const startHandleDrag = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
    side: 'in' | 'out',
  ) => {
    e.stopPropagation();
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'handle', strokeIdx, vIdx, side };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const startNormalDrag = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    // Shift+click clears the override (back to auto / connected to anchor).
    if (e.shiftKey) {
      onChange((g) => clearNormalOverride(g, strokeIdx, vIdx));
      setSelection({ kind: 'anchor', strokeIdx, vIdx });
      return;
    }
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'normal', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onAddStroke = () => onChange((g) => addStroke(g));
  // Indices of all currently-selected strokes (for actions that act on the
  // selection: copy, delete, flip). Includes the stroke under an anchor
  // selection and every stroke in a multi-selection.
  const selectedStrokeIdxs: readonly number[] = (() => {
    if (selection.kind === 'stroke') return [selection.strokeIdx];
    if (selection.kind === 'anchor') return [selection.strokeIdx];
    if (selection.kind === 'multi') return selection.strokeIdxs;
    return [];
  })();
  const onDeleteSelected = () => {
    if (selection.kind === 'anchor') {
      onChange((g) => deleteAnchor(g, selection.strokeIdx, selection.vIdx));
      setSelection({ kind: 'none' });
      return;
    }
    if (selectedStrokeIdxs.length === 0) return;
    // Delete from highest index downward so earlier indices stay valid.
    const idxs = [...selectedStrokeIdxs].sort((a, b) => b - a);
    onChange((g) => idxs.reduce((acc, i) => deleteStroke(acc, i), g));
    setSelection({ kind: 'none' });
  };
  const onFlipH = () => {
    if (selectedStrokeIdxs.length === 0) return;
    const idxs = selectedStrokeIdxs;
    onChange((g) =>
      idxs.reduce((acc, i) => flipStrokeHorizontal(acc, i, g.box.w / 2), g),
    );
  };
  const onFlipV = () => {
    if (selectedStrokeIdxs.length === 0) return;
    const idxs = selectedStrokeIdxs;
    onChange((g) =>
      idxs.reduce((acc, i) => flipStrokeVertical(acc, i, g.box.h / 2), g),
    );
  };

  // Pointer-down on a stroke path:
  //   - Alt-click: insert anchor at the closest segment's midpoint (no drag).
  //   - Plain: select the stroke and start a drag-to-translate. If the
  //     pointer is released without moving, this is just a click (selection
  //     was already applied).
  const onStrokePointerDown = (e: React.PointerEvent, strokeIdx: number) => {
    e.stopPropagation();
    if (e.altKey) {
      const p = toGlyph(e.clientX, e.clientY);
      if (!p) return;
      const stroke = glyph.strokes[strokeIdx];
      if (!stroke) return;
      // Project the click onto the stroke: pick the segment whose nearest
      // point on the curve is closest to p, then insert an anchor at that
      // exact parameter t. Result: the new anchor lands under the cursor.
      const hit = nearestPointOnStroke(stroke, p);
      if (!hit) return;
      onChange((g) => insertAnchor(g, strokeIdx, hit.segIdx, hit.t));
      return;
    }
    const p = toGlyph(e.clientX, e.clientY);
    if (!p) return;
    // Shift-click toggles the stroke in/out of the multi-selection.
    if (e.shiftKey) {
      const cur =
        selection.kind === 'multi'
          ? selection.strokeIdxs
          : selection.kind === 'stroke'
            ? [selection.strokeIdx]
            : selection.kind === 'anchor'
              ? [selection.strokeIdx]
              : [];
      const set = new Set(cur);
      if (set.has(strokeIdx)) set.delete(strokeIdx);
      else set.add(strokeIdx);
      const next = Array.from(set).sort((a, b) => a - b);
      if (next.length === 0) setSelection({ kind: 'none' });
      else if (next.length === 1) setSelection({ kind: 'stroke', strokeIdx: next[0]! });
      else setSelection({ kind: 'multi', strokeIdxs: next });
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    // If clicked stroke is part of an existing multi-selection, drag the
    // whole group as one. Otherwise replace the selection.
    if (selection.kind === 'multi' && selection.strokeIdxs.includes(strokeIdx)) {
      dragRef.current = {
        kind: 'multi',
        strokeIdxs: selection.strokeIdxs,
        lastX: p.x,
        lastY: p.y,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    setSelection({ kind: 'stroke', strokeIdx });
    dragRef.current = {
      kind: 'stroke',
      strokeIdx,
      lastX: p.x,
      lastY: p.y,
      moved: false,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const selectedAnchor =
    selection.kind === 'anchor'
      ? glyph.strokes[selection.strokeIdx]?.vertices[selection.vIdx]
      : undefined;

  // ---------- Copy / paste of strokes ---------------------------------------
  // Ctrl/Cmd+C copies the currently selected stroke (or the stroke containing
  // the selected anchor) into the module-level clipboard. Ctrl/Cmd+V appends
  // clones of the clipboard's strokes to the current glyph and selects the
  // first newly-pasted stroke. The clipboard outlives glyph switches so
  // cross-glyph paste works.
  const stateRef = useRef<{
    selection: Selection;
    glyph: Glyph;
    onChange: (fn: (g: Glyph) => Glyph) => void;
  }>({ selection, glyph, onChange });
  useEffect(() => {
    stateRef.current = { selection, glyph, onChange };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Don't hijack copy/paste while the user is typing in a form field.
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
          return;
        }
      }
      const k = e.key.toLowerCase();
      if (k === 'c') {
        const { selection: sel, glyph: g } = stateRef.current;
        let idxs: number[] = [];
        if (sel.kind === 'stroke') idxs = [sel.strokeIdx];
        else if (sel.kind === 'anchor') idxs = [sel.strokeIdx];
        else if (sel.kind === 'multi') idxs = [...sel.strokeIdxs];
        const srcs = idxs
          .map((i) => g.strokes[i])
          .filter((s): s is Stroke => !!s);
        if (srcs.length === 0) return;
        // Clone now so a later edit of `src` doesn't mutate the clipboard.
        strokeClipboard = {
          strokes: srcs.map((s) => cloneStroke(s)),
          sourceCenter: { x: g.box.w / 2, y: g.box.h / 2 },
        };
        e.preventDefault();
      } else if (k === 'v') {
        if (!strokeClipboard || strokeClipboard.strokes.length === 0) return;
        const { onChange: oc, glyph: g } = stateRef.current;
        const startIdx = g.strokes.length;
        const count = strokeClipboard.strokes.length;
        // Preserve position relative to the box centre: shift by the
        // difference between target and source centres so the pasted
        // artwork sits at the same offset from the centre.
        const offset = {
          x: g.box.w / 2 - strokeClipboard.sourceCenter.x,
          y: g.box.h / 2 - strokeClipboard.sourceCenter.y,
        };
        const pasted = strokeClipboard.strokes;
        oc((cur) => pasteStrokes(cur, pasted, offset));
        if (count === 1) {
          setSelection({ kind: 'stroke', strokeIdx: startIdx });
        } else {
          setSelection({
            kind: 'multi',
            strokeIdxs: Array.from({ length: count }, (_, i) => startIdx + i),
          });
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- Wheel + pinch zoom -------------------------------------------
  // Bound through the shared canvas-input hook so every workspace
  // gets the same exponential wheel zoom + two-finger pinch behaviour
  // and the same `spaceDown`-tracking semantics. The hook calls
  // `setView({ editorScale })` directly via the adapter below; the
  // header slider reflects the value because it reads the same store.
  const setView = props.setView;
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const cameraGetterRef = useRef(view);
  cameraGetterRef.current = view;
  const { spaceDown } = useCanvasInput(svgRef, {
    getCamera: () => ({
      panX: cameraGetterRef.current.panX ?? 0,
      panY: cameraGetterRef.current.panY ?? 0,
      zoom: cameraGetterRef.current.editorScale,
    }),
    setCamera: (patch) => {
      if (patch.zoom !== undefined) setViewRef.current({ editorScale: patch.zoom });
      if (patch.panX !== undefined || patch.panY !== undefined) {
        setViewRef.current({
          ...(patch.panX !== undefined ? { panX: patch.panX } : {}),
          ...(patch.panY !== undefined ? { panY: patch.panY } : {}),
        });
      }
    },
    minZoom: MIN_EDITOR_SCALE,
    maxZoom: MAX_EDITOR_SCALE,
    pan: 'both',
  });

  return (
    <>
      {/* Canvas — fills remaining space. The editing toolbar is anchored
          to (and exactly the width of) the .mz-glyph-canvas SVG so it
          tracks the artwork rather than the column. The SVG itself sits
          in its own scroll-and-center wrapper so the glyph's centre
          stays in the middle of the bench at every zoom level. */}
      <div
        className="mz-glyphsetter__canvas"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--mz-paper)',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 0,
          position: 'relative',
        }}
      >
        <div
          className="mz-glyphsetter__toolbar"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 8,
            transform: 'translateX(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '4px 10px',
            background: 'var(--mz-paper)',
            border: '1px solid var(--mz-line)',
            borderRadius: 4,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            fontSize: 13,
            flexShrink: 0,
            boxSizing: 'border-box',
            minHeight: 32,
            zIndex: 5,
          }}
        >
          <button onClick={onAddStroke} aria-label="Add stroke" title="Add stroke">
            <MoritzLabel text="Add stroke" size={12} />
          </button>
          <button
            onClick={() => {
              // Pick a target stroke + segment to split. Prefer the segment
              // following the selected anchor (or before, if it's the last
              // vertex). If only a stroke is selected, split its middle
              // segment. Bail out otherwise.
              let strokeIdx = -1;
              let segIdx = -1;
              if (selection.kind === 'anchor') {
                const s = glyph.strokes[selection.strokeIdx];
                if (!s) return;
                strokeIdx = selection.strokeIdx;
                segIdx =
                  selection.vIdx < s.vertices.length - 1
                    ? selection.vIdx
                    : selection.vIdx - 1;
              } else if (selection.kind === 'stroke') {
                const s = glyph.strokes[selection.strokeIdx];
                if (!s || s.vertices.length < 2) return;
                strokeIdx = selection.strokeIdx;
                segIdx = Math.floor((s.vertices.length - 1) / 2);
              } else {
                return;
              }
              if (strokeIdx < 0 || segIdx < 0) return;
              onChange((g) => insertAnchor(g, strokeIdx, segIdx, 0.5));
              // Newly inserted anchor lands at segIdx + 1; select it.
              setSelection({ kind: 'anchor', strokeIdx, vIdx: segIdx + 1 });
            }}
            disabled={selection.kind !== 'anchor' && selection.kind !== 'stroke'}
            title="Insert a new anchor at the midpoint of the segment after the selected anchor (or in the middle of the selected stroke). Tip: alt-click a stroke to insert at the click point."
            aria-label="Add anchor"
          >
            <MoritzLabel text="Add anchor" size={12} />
          </button>
          <button
            onClick={onDeleteSelected}
            disabled={selectedStrokeIdxs.length === 0 && selection.kind !== 'anchor'}
            aria-label="Delete selected"
            title="Delete selected"
          >
            <MoritzLabel text="Delete selected" size={12} />
          </button>
          <button
            onClick={onFlipH}
            disabled={selectedStrokeIdxs.length === 0}
            title="Mirror the selected stroke(s) around the glyph box's vertical centre line"
            aria-label="Flip horizontal"
          >
            <MoritzLabel text="Flip H" size={12} />
          </button>
          <button
            onClick={onFlipV}
            disabled={selectedStrokeIdxs.length === 0}
            title="Mirror the selected stroke(s) around the glyph box's horizontal centre line"
            aria-label="Flip vertical"
          >
            <MoritzLabel text="Flip V" size={12} />
          </button>
          {/* Reserved slot for the per-anchor 'Break tangent' control so
              the bar layout doesn't shift when an anchor is selected. */}
          <label
            style={{
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              width: 110,
              flexShrink: 0,
              visibility:
                selectedAnchor && selection.kind === 'anchor'
                  ? 'visible'
                  : 'hidden',
            }}
          >
            <input
              type="checkbox"
              checked={selectedAnchor?.breakTangent === true}
              disabled={!(selectedAnchor && selection.kind === 'anchor')}
              onChange={(e) => {
                if (selection.kind !== 'anchor') return;
                onChange((g) =>
                  setBreakTangent(g, selection.strokeIdx, selection.vIdx, e.target.checked),
                );
              }}
            />
            <MoritzLabel text="Break tangent" size={11} />
          </label>
          {extraToolbar}
          <span
            style={{ color: 'var(--mz-text-mute)', fontSize: 11 }}
            title="Drag anchors / handles. Drag stroke body = move whole stroke. Alt-click stroke = insert anchor. Alt-click anchor = toggle corner/smooth."
          >
            (?)
          </span>
        </div>
        <div
          ref={wrapRef}
          className={
            'mz-glyphsetter__viewport mz-canvas mz-canvas--free' +
            (props.world ? ' mz-canvas--world' : '')
          }
        >
        <svg
          ref={svgRef}
          className="mz-glyph-canvas"
          viewBox={`0 0 ${viewW} ${viewH}`}
          width={viewW}
          height={viewH}
          style={{ display: 'block', position: 'absolute', inset: 0, touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* background â€” pointer-down starts a marquee selection. A
              zero-area release (i.e. a plain click) just deselects.
              Middle-mouse button or space+left-mouse pans instead. */}
          <rect
            x={0}
            y={0}
            width={viewW}
            height={viewH}
            // In world (bubble) mode the workspace is a flat grey so a
            // bubble's paper-white fill stands out; in glyph mode it's
            // the standard paper white.
            fill={props.world ? '#e8e8e8' : 'var(--mz-paper)'}
            style={spaceDown ? { cursor: 'grab' } : undefined}
            onPointerDown={(e) => {
              const isPan = isPanGesture(e.button, spaceDown, 'both');
              if (isPan) {
                e.preventDefault();
                dragRef.current = {
                  kind: 'pan',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startPanX: view.panX ?? 0,
                  startPanY: view.panY ?? 0,
                };
                (e.target as Element).setPointerCapture(e.pointerId);
                return;
              }
              if (e.button !== 0) return;
              const p = toGlyph(e.clientX, e.clientY);
              if (!p) return;
              dragRef.current = {
                kind: 'marquee',
                startX: p.x,
                startY: p.y,
                curX: p.x,
                curY: p.y,
              };
              setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
          />
          {/* default box â€” a fixed square reference frame so adjustments
              to the current glyph box read as deviations from default.
              Hidden in world mode (BubbleSetter): the world IS the
              reference frame there. */}
          {!props.world && (
            <rect
              className="mz-default-box"
              x={defBoxX}
              y={defBoxY}
              width={DEFAULT_BOX * SCALE}
              height={DEFAULT_BOX * SCALE}
              fill="none"
              stroke="var(--mz-line)"
              strokeDasharray="6 4"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {/* glyph box â€” the 'sheet' the character sits on. Hidden in
              world mode â€” the underlay draws the world (e.g. bubble)
              outline instead, which doesn't jump on layer change. */}
          {!props.world && (
            <rect
              className="mz-glyph-box"
              x={gBoxX}
              y={gBoxY}
              width={glyph.box.w * SCALE}
              height={glyph.box.h * SCALE}
              fill="none"
              stroke="var(--mz-glyph-accent)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {/* Caller-supplied underlay. In plain mode it's drawn in glyph
              coords; in world mode it's drawn in world coords (so it
              stays anchored when the user switches the edited layer). */}
          {props.underlay && (
            <g transform={underlayXform} pointerEvents="none">
              {props.underlay}
            </g>
          )}
          {/* Lined-paper grid â€” horizontal lines at the active style's
              line-height interval, extending across the whole canvas.
              In world mode the grid is anchored to the world box bottom
              (so it doesn't jump on layer switch); otherwise it's
              anchored to the glyph baseline. */}
          {view.showLineGrid && (() => {
            const lineMul = font.style.lineHeight ?? 1.2;
            // World mode: spacing is `world.lineHeight` if provided,
            // else fall back to font-line-height Ã— glyph-box-h Ã—
            // glyph-to-world scale (so it tracks the layer's size).
            const lineUnitsWorld = props.world
              ? (props.world.lineHeight ?? lineMul * glyph.box.h * worldGlyphS)
              : lineMul * glyph.box.h;
            const linePx = props.world
              ? lineUnitsWorld * worldS
              : lineUnitsWorld * SCALE;
            if (linePx < 4) return null;
            const baseline = props.world
              ? worldOriginY + worldBoxH * worldS
              : gBoxY + glyph.box.h * SCALE;
            const lines: JSX.Element[] = [];
            // Draw lines covering the entire viewport, both above and
            // below the baseline.
            const above = Math.ceil(baseline / linePx) + 1;
            const below = Math.ceil((viewH - baseline) / linePx) + 1;
            for (let i = -above; i <= below; i++) {
              const y = baseline + i * linePx;
              lines.push(
                <line
                  key={`lg${i}`}
                  x1={0}
                  y1={y}
                  x2={viewW}
                  y2={y}
                  stroke="var(--mz-line)"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />,
              );
            }
            return <g pointerEvents="none">{lines}</g>;
          })()}
          {/* reference font (system/web font) traced behind the ink. The
              baseline + cap- or x-height are read from the first visible
              calligraphy guide layer (if any); otherwise it falls back to
              the glyph box. We assume the browser font has cap-height â‰ˆ
              0.70em and x-height â‰ˆ 0.50em, which is true for nearly all
              the curated families. Skipped in world mode â€” bubbles
              don't have a single "glyph" baseline to trace against. */}
          {!props.world && view.refFontFamily && (() => {
            const calli = view.guides.layers.find(
              (l) => l.visible && l.kind.kind === 'calligraphy',
            );
            // Default: baseline at glyph-box bottom, cap-height = box.h.
            let baselinePx = gBoxY + glyph.box.h * SCALE;
            let capPx = glyph.box.h * SCALE;
            let xPx = capPx * 0.5;
            if (calli && calli.kind.kind === 'calligraphy') {
              const k = calli.kind;
              const cap  = Math.max(0.30, Math.min(0.90, k.capHeight));
              const xr   = Math.max(0.30, Math.min(0.95, k.xHeight));
              const asc  = Math.max(0.00, Math.min(0.35, k.ascender));
              const desc = Math.max(0.00, Math.min(0.40, k.descender));
              const w    = Math.max(-0.30, Math.min(0.30, k.weight));
              const total = asc + cap + desc;
              const minB = asc + cap;
              const maxB = 1 - desc;
              const natural = (1 - total) * 0.5 + asc + cap;
              const baseline = Math.max(minB, Math.min(maxB, natural + w));
              baselinePx = defBoxY + baseline * DEFAULT_BOX * SCALE;
              capPx = cap * DEFAULT_BOX * SCALE;
              xPx = xr * cap * DEFAULT_BOX * SCALE;
            }
            // Use x-height for lowercase ascii letters that have no ascender,
            // cap-height for everything else (uppercase, digits, ascender
            // lowercase like b/d/f/h/k/l/t, punctuation).
            const isXHeight = /^[acemnorsuvwxz]$/.test(char);
            // Size from measured font metrics so the drawn cap-/x-height
            // exactly matches the guide.
            const fm = measureFontMetrics(view.refFontFamily);
            const fontSize = isXHeight
              ? xPx / Math.max(0.05, fm.xHeight)
              : capPx / Math.max(0.05, fm.capHeight);
            return (
              <text
                className="mz-ref-glyph"
                x={cx}
                y={baselinePx}
                fontFamily={view.refFontFamily}
                fontSize={fontSize}
                textAnchor="middle"
                fill="var(--mz-text)"
                opacity={view.refFontOpacity}
                pointerEvents="none"
                style={{ userSelect: 'none' }}
              >
                {char}
              </text>
            );
          })()}
          {/* sidebearing guides â€” vertical lines indicating advance edges.
              Glyph-only concept; hidden in world (bubble) mode. */}
          {!props.world && (() => {
            const lsb = glyph.sidebearings?.left ?? 0;
            const rsb = glyph.sidebearings?.right ?? 0;
            if (lsb === 0 && rsb === 0) return null;
            const xLeft = gBoxX - lsb * SCALE;
            const xRight = gBoxX + (glyph.box.w + rsb) * SCALE;
            const y0 = gBoxY;
            const y1 = gBoxY + glyph.box.h * SCALE;
            return (
              <g className="mz-sidebearings" pointerEvents="none">
                <line
                  x1={xLeft}
                  x2={xLeft}
                  y1={y0}
                  y2={y1}
                  stroke="var(--mz-glyph-accent)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <line
                  x1={xRight}
                  x2={xRight}
                  y1={y0}
                  y2={y1}
                  stroke="var(--mz-glyph-accent)"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              </g>
            );
          })()}
          {/* guides â€” anchored to the *default* box reference frame, so they
              never slide when the glyph's own box.{w,h} changes. Lines are
              extruded along their own direction to a huge multiple of the
              default box so they read as infinite rules across the whole
              workspace (matches Illustrator-style guides). Hidden in world
              (bubble) mode â€” bubbles use only the lined-paper grid. */}
          {!props.world && view.guides.enabled && (
            <g
              transform={`translate(${defBoxX} ${defBoxY}) scale(${SCALE})`}
              pointerEvents="none"
            >
              {view.guides.layers.map((l) => {
                if (!l.visible) return null;
                const g = computeLayerGeometry(l, DEFAULT_BOX, DEFAULT_BOX);
                const sw = l.strokeWidth / SCALE;
                // Far enough that the line spills past any reasonable
                // canvas size at any zoom level. (In glyph units; the
                // group's `scale(SCALE)` shrinks it back down.)
                const FAR = 1e5;
                return (
                  <g key={l.id} stroke={l.color} fill={l.color} opacity={l.opacity}>
                    {g.lines.map((ln, i) => {
                      const dx = ln.x2 - ln.x1;
                      const dy = ln.y2 - ln.y1;
                      const len = Math.hypot(dx, dy) || 1;
                      const ux = dx / len;
                      const uy = dy / len;
                      return (
                        <line
                          key={`l${i}`}
                          x1={ln.x1 - ux * FAR}
                          y1={ln.y1 - uy * FAR}
                          x2={ln.x2 + ux * FAR}
                          y2={ln.y2 + uy * FAR}
                          strokeWidth={sw}
                          fill="none"
                        />
                      );
                    })}
                    {g.arcs.map((a, i) => (
                      <path
                        key={`a${i}`}
                        d={`M ${a.x1} ${a.y1} A ${a.rx} ${a.ry} 0 ${a.largeArc} ${a.sweep} ${a.x2} ${a.y2}`}
                        strokeWidth={sw}
                        fill="none"
                      />
                    ))}
                    {g.circles.map((c, i) => (
                      <circle
                        key={`c${i}`}
                        cx={c.cx}
                        cy={c.cy}
                        r={c.r}
                        strokeWidth={sw}
                        fill="none"
                      />
                    ))}
                    {g.dots.map((d, i) => (
                      <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} stroke="none" />
                    ))}
                  </g>
                );
              })}
            </g>
          )}
          {/* other glyphs of the set, faint red â€” to see how shapes overlap.
              Each glyph is drawn at 5% on its own <g> so opacities accumulate.
              Hidden in world (bubble) mode â€” the bubble's own siblings
              already render via the underlay. */}
          {!props.world && view.showOtherGlyphs && (
            <g
              transform={xform}
              fill="rgb(220,30,30)"
              pointerEvents="none"
            >
              {Object.entries(font.glyphs).map(([c, g]) => {
                if (c === char) return null;
                const ogStyle = effectiveStyleForGlyph(font.style, g);
                const dg = previewGlyph(g, font.style, { instanceIndex: 0, char: c });
                return (
                  <g key={`other-${c}`} opacity={0.05}>
                    {dg.strokes.map((s, i) => {
                      const { polygon, triangles } = triangulateForStyle(s, ogStyle, {
                        instanceIndex: i,
                        char: c,
                      }, g.box.h);
                      return <path key={`o${i}`} d={trianglesD(polygon, triangles)} />;
                    })}
                  </g>
                );
              })}
            </g>
          )}
          {/* outlined preview (faded) — fill comes from the triangulated mesh */}
          {view.showFillPreview && (
            <g
              transform={xform}
              // In world (bubble) mode this overlay *is* the active
              // layer's ink stroke, so it follows the Stroke-opacity
              // slider. In glyph mode it's the standalone fill preview
              // and follows Fill-opacity.
              fill={`rgba(0,0,0,${props.world ? view.strokeOpacity : view.fillOpacity})`}
              pointerEvents="none"
            >
              {displayGlyph.strokes.map((s, i) => {
                const { polygon, triangles } = triangulateForStyle(s, gStyle, {
                  instanceIndex: i,
                  char,
                }, glyph.box.h);
                return <path key={`o${i}`} d={trianglesD(polygon, triangles)} />;
              })}
            </g>
          )}
          {animatorFrames.length > 0 && (
            <g transform={xform} pointerEvents="none">
              {animatorFrames.map((frame) => {
                const r = 5 / SCALE;
                const fontPx = 8 / SCALE;
                const label = frame.id.slice(0, 1).toUpperCase();
                return (
                  <g
                    key={`${frame.strokeId}.${frame.id}.${frame.index}`}
                    transform={`translate(${frame.p.x} ${frame.p.y}) rotate(${frame.angle * 180 / Math.PI})`}
                  >
                    <circle
                      r={r}
                      fill="var(--mz-glyph-accent)"
                      stroke="var(--mz-glyph-bg)"
                      strokeWidth={1.2 / SCALE}
                    />
                    <text
                      x={0}
                      y={fontPx * 0.35}
                      fontSize={fontPx}
                      textAnchor="middle"
                      fill="var(--mz-glyph-bg)"
                      style={{ userSelect: 'none' }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {/* debug border overlay */}
          {view.showBorders && (
            <g
              transform={xform}
              fill="none"
              pointerEvents="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {displayGlyph.strokes.map((s, i) => {
                const poly = outlineStroke(s, gStyle);
                const sw = 1.4 / SCALE;
                const dotR = 2.6 / SCALE;
                const fontPx = 9 / SCALE;
                const closed = poly.length > 0 ? [...poly, poly[0]!] : [];
                return (
                  <g key={`b${i}`}>
                    <path d={polylineD(closed)} stroke="var(--mz-glyph-accent)" strokeWidth={sw} />
                    {poly.map((p, k) => (
                      <g key={`v${i}-${k}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={dotR}
                          fill="var(--mz-glyph-accent)"
                          stroke="var(--mz-glyph-bg)"
                          strokeWidth={sw * 0.6}
                        />
                        <text
                          x={p.x + dotR * 1.4}
                          y={p.y - dotR * 1.4}
                          fontSize={fontPx}
                          fill="var(--mz-glyph-accent)"
                          stroke="var(--mz-glyph-bg)"
                          strokeWidth={sw * 0.4}
                          paintOrder="stroke"
                          style={{ userSelect: 'none' }}
                        >
                          {k}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })}
            </g>
          )}
          {/* triangulation overlay */}
          {view.showTriangles && (
            <g
              transform={xform}
              fill="none"
              pointerEvents="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {displayGlyph.strokes.map((s, i) => {
                const { polygon, triangles } = triangulateForStyle(s, gStyle, {
                  instanceIndex: i,
                  char,
                }, glyph.box.h);
                const sw = 0.6 / SCALE;
                return (
                  <g key={`t${i}`}>
                    {triangles.map((tri, k) => {
                      const a = polygon[tri[0]]!;
                      const b = polygon[tri[1]]!;
                      const c = polygon[tri[2]]!;
                      const d = `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z`;
                      return (
                        <path
                          key={`t${i}-${k}`}
                          d={d}
                          stroke="#e0457b"
                          strokeWidth={sw}
                          fill="rgba(224, 69, 123, 0.06)"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}
          <g transform={xform}>
            {glyph.strokes.map((s, sIdx) => (
              <StrokeOverlay
                key={s.id}
                stroke={s}
                strokeIdx={sIdx}
                selection={selection}
                showAnchors={view.showAnchors}
                scale={SCALE}
                profile={s.width ?? font.style.defaultWidth}
                onStrokePointerDown={onStrokePointerDown}
                onAnchorPointerDown={startAnchorDrag}
                onHandlePointerDown={startHandleDrag}
                onNormalPointerDown={startNormalDrag}
              />
            ))}
          </g>
          {/* spline0 + tangents debug overlay (drawn ON TOP of control
              geometry so it isn't hidden by anchor squares). */}
          {view.showSpline0 && (
            <g transform={xform} pointerEvents="none">
              {displayGlyph.strokes.map((s, i) => {
                const data = ribbonDebugSpline0(s, gStyle);
                if (data.length === 0) return null;
                const r = 4 / SCALE;
                const sw = 1.6 / SCALE;
                const refHalf = ((s.width ?? font.style.defaultWidth).samples[0]?.width ?? 10) * 0.5;
                const tanLen = Math.max(8 / SCALE, refHalf * 1.5);
                const normLen = Math.max(6 / SCALE, refHalf * 1.0);
                return (
                  <g key={`sp0-${i}`}>
                    {data.map((a, k) => {
                      const inEnd = {
                        x: a.p.x - a.tangentIn.x * tanLen,
                        y: a.p.y - a.tangentIn.y * tanLen,
                      };
                      const outEnd = {
                        x: a.p.x + a.tangentOut.x * tanLen,
                        y: a.p.y + a.tangentOut.y * tanLen,
                      };
                      const nL = {
                        x: a.p.x + a.normal.x * normLen,
                        y: a.p.y + a.normal.y * normLen,
                      };
                      const nR = {
                        x: a.p.x - a.normal.x * normLen,
                        y: a.p.y - a.normal.y * normLen,
                      };
                      const hasIn = a.tangentIn.x !== 0 || a.tangentIn.y !== 0;
                      const hasOut = a.tangentOut.x !== 0 || a.tangentOut.y !== 0;
                      return (
                        <g key={`sp0-${i}-${k}`}>
                          <line
                            x1={nL.x}
                            y1={nL.y}
                            x2={nR.x}
                            y2={nR.y}
                            stroke="var(--mz-glyph-accent)"
                            strokeWidth={sw}
                            strokeLinecap="round"
                          />
                          {hasIn && (                            <line
                              x1={a.p.x}
                              y1={a.p.y}
                              x2={inEnd.x}
                              y2={inEnd.y}
                              stroke="var(--mz-glyph-accent)"
                              strokeWidth={sw}
                              strokeLinecap="round"
                            />
                          )}
                          {hasOut && (
                            <line
                              x1={a.p.x}
                              y1={a.p.y}
                              x2={outEnd.x}
                              y2={outEnd.y}
                              stroke="var(--mz-glyph-accent)"
                              strokeWidth={sw}
                              strokeLinecap="round"
                            />
                          )}
                          <circle
                            cx={a.p.x}
                            cy={a.p.y}
                            r={r}
                            fill="var(--mz-glyph-accent)"
                            stroke="var(--mz-glyph-bg)"
                            strokeWidth={sw}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}
          {/* spline1 (subdivided spine) + per-vertex normals debug overlay. */}
          {view.showSpline1 && (
            <g transform={xform} pointerEvents="none">
              {displayGlyph.strokes.map((s, i) => {
                const spineSubdiv = ribbonSpineSubdivOf(font.style);
                const brokenAnchorSubdiv = font.style.ribbonBrokenAnchorSubdiv ?? 0;
                const spineLengthAware = ribbonSpineLengthAwareOf(font.style);
                const data = ribbonDebugSpline1(s, gStyle, spineSubdiv, null, brokenAnchorSubdiv, spineLengthAware, displayGlyph.box.h);
                if (data.length === 0) return null;
                const r = 2.5 / SCALE;
                const sw = 1.2 / SCALE;
                const tanLen = Math.max(5 / SCALE, 6 / SCALE);
                return (
                  <g key={`sp1-${i}`}>
                    {data.map((v, k) => {
                      // Normal bar length = the actual contracted half-width
                      // used by the ribbon (so it shows what the renderer sees).
                      const half = v.half;
                      const nL = {
                        x: v.p.x + v.normal.x * half,
                        y: v.p.y + v.normal.y * half,
                      };
                      const nR = {
                        x: v.p.x - v.normal.x * half,
                        y: v.p.y - v.normal.y * half,
                      };
                      const tEnd = {
                        x: v.p.x + v.tangent.x * tanLen,
                        y: v.p.y + v.tangent.y * tanLen,
                      };
                      return (
                        <g key={`sp1-${i}-${k}`}>
                          <line
                            x1={nL.x}
                            y1={nL.y}
                            x2={nR.x}
                            y2={nR.y}
                            stroke="var(--mz-style-accent)"
                            strokeWidth={sw}
                            strokeLinecap="round"
                          />
                          <line
                            x1={v.p.x}
                            y1={v.p.y}
                            x2={tEnd.x}
                            y2={tEnd.y}
                            stroke="#0066cc"
                            strokeWidth={sw}
                            strokeLinecap="round"
                          />
                          <circle
                            cx={v.p.x}
                            cy={v.p.y}
                            r={r}
                            fill="var(--mz-style-accent)"
                            stroke="var(--mz-style-bg)"
                            strokeWidth={sw * 0.6}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}
          {marquee && (() => {
            // Marquee in screen coords: scale + translate from glyph coords.
            const x = Math.min(marquee.x1, marquee.x2) * SCALE + originX;
            const y = Math.min(marquee.y1, marquee.y2) * SCALE + originY;
            const w = Math.abs(marquee.x2 - marquee.x1) * SCALE;
            const h = Math.abs(marquee.y2 - marquee.y1) * SCALE;
            return (
              <rect
                className="mz-marquee"
                x={x}
                y={y}
                width={w}
                height={h}
                fill="rgba(29,111,230,0.10)"
                stroke="#1d6fe6"
                strokeDasharray="4 3"
                strokeWidth={1}
                pointerEvents="none"
              />
            );
          })()}
        </svg>
        </div>
      </div>
    </>
  );
}

// ---------- Inspector panels (split across left "Settings" tab + right drawer)

/**
 * Left-drawer "Settings" tab. Holds View options and per-font Guides.
 * Guides are stored on Font (not on the per-glyph view) so they apply
 * uniformly to every glyph in the typeface.
 */
export function SettingsPanel(props: {
  view: GlyphViewOptions;
  setView: (patch: Partial<GlyphViewOptions>) => void;
  setFontGuides: (g: GuideSettings) => void;
  /** When true (default), skip the glyph-only entries: "Other glyphs",
   *  the reference-font picker, and the entire Guides section. Used
   *  by BubbleSetter, which shares the View toggles but not the glyph
   *  guide system. */
  bubbleMode?: boolean;
}): JSX.Element {
  const { view, setView, setFontGuides, bubbleMode = false } = props;
  return (
    <aside
      className="mz-glyphsetter__inspector"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'transparent',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxSizing: 'border-box',
      }}
    >
      <Section title="View" tone="local">
        <Check
          label="Anchors"
          checked={view.showAnchors}
          onChange={(v) => setView({ showAnchors: v })}
          tooltip="Show anchor points and tangent handles for direct manipulation."
        />
        <Check
          label="Fill preview"
          checked={view.showFillPreview}
          onChange={(v) => setView({ showFillPreview: v })}
          tooltip="Render the triangulated fill of each stroke so the final glyph shape is visible while editing."
        />
        {view.showFillPreview && (
          <>
            <NumSlider
              label={bubbleMode ? 'Bubble fill opacity' : 'Fill opacity'}
              min={0}
              max={1}
              step={0.01}
              value={view.fillOpacity}
              onChange={(v) => setView({ fillOpacity: v })}
              tooltip={
                bubbleMode
                  ? "Opacity of the bubble's paper-white fill behind the strokes."
                  : 'Opacity of the fill preview (0 = invisible, 1 = solid black).'
              }
            />
            {bubbleMode && (
              <NumSlider
                label="Stroke opacity"
                min={0}
                max={1}
                step={0.01}
                value={view.strokeOpacity}
                onChange={(v) => setView({ strokeOpacity: v })}
                tooltip="Opacity of the ink stroke polygons (0 = invisible, 1 = solid)."
              />
            )}
          </>
        )}
        {!bubbleMode && (
          <Check
            label="Other glyphs (faint)"
            checked={view.showOtherGlyphs}
            onChange={(v) => setView({ showOtherGlyphs: v })}
            tooltip="Overlay every other glyph in the font behind the edited one for visual reference."
          />
        )}
        <Check
          label="Debug borders"
          checked={view.showBorders}
          onChange={(v) => setView({ showBorders: v })}
          tooltip="Color-code the left/right offsets and caps of each stroke for debugging the outliner."
        />
        <Check
          label="Triangles"
          checked={view.showTriangles}
          onChange={(v) => setView({ showTriangles: v })}
          tooltip="Show the triangulation mesh used by the renderer."
        />
        <Check
          label="Spline0 + tangents"
          checked={view.showSpline0}
          onChange={(v) => setView({ showSpline0: v })}
          tooltip="Debug: dot at every user anchor, lines for in/out tangents, and the world-blended normal at each anchor."
        />
        <Check
          label="Spline1 + normals"
          checked={view.showSpline1}
          onChange={(v) => setView({ showSpline1: v })}
          tooltip="Debug: full row of subdivided spine vertices (anchors + ribbon spine subdivisions) with their tangents and world-blended normals scaled to the local half-width."
        />
        {!bubbleMode && (
          <RefFontPicker
            family={view.refFontFamily}
            opacity={view.refFontOpacity}
            onChange={setView}
          />
        )}
      </Section>
      {!bubbleMode && (
        <Section title="Guides" tone="glyphfont" subtitle="Per-font defaults">
          <GuidesPanel
            value={view.guides}
            onChange={(guides) => setFontGuides(guides)}
            refFontFamily={view.refFontFamily}
          />
        </Section>
      )}
    </aside>
  );
}

/**
 * Per-glyph metrics panel (box, side bearings, baseline, per-glyph world
 * angle offsets). Rendered inside the bare floating "Glyph" window — no
 * extra titles, no extra borders. Mass-actions (import metrics, zero
 * bearings) live behind a small "⋯" popover so the panel stays sliders-only
 * by default.
 */
function GlyphMetricsPanel(props: {
  glyph: Glyph;
  view: GlyphViewOptions;
  updateGlyph: (fn: (g: Glyph) => Glyph) => void;
  updateAllGlyphs: (fn: (g: Glyph, char: string) => Glyph) => void;
  onSelectAnimator: () => void;
}): JSX.Element {
  const { glyph, view, updateGlyph, updateAllGlyphs } = props;
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setActionsOpen((o) => !o)}
        title="More actions"
        style={{
          position: 'absolute',
          top: 0,
          right: 22,
          padding: '0 4px',
          fontSize: 12,
          lineHeight: 1,
          background: 'transparent',
          border: '1px solid transparent',
          color: 'var(--mz-text-mute)',
          cursor: 'pointer',
        }}
      >
        ⋯
      </button>
      {actionsOpen && (
        <ActionsPopover onClose={() => setActionsOpen(false)}>
          <button
            type="button"
            disabled={!view.refFontFamily}
            onClick={() => {
              if (!view.refFontFamily) return;
              updateGlyph((g) => importGlyphMetrics(g, glyph.char, view.refFontFamily));
              setActionsOpen(false);
            }}
            title={
              view.refFontFamily
                ? "Set this glyph's box width and side bearings from the reference font."
                : 'Pick a Reference font in the View section first.'
            }
            aria-label="Import metrics this glyph"
          >
            <MoritzLabel text="Import metrics" size={12} />
          </button>
          <button
            type="button"
            disabled={!view.refFontFamily}
            onClick={() => {
              if (!view.refFontFamily) return;
              if (!confirm('Import metrics from the reference font for ALL glyphs?')) return;
              updateAllGlyphs((g, char) => importGlyphMetrics(g, char, view.refFontFamily));
              setActionsOpen(false);
            }}
            aria-label="Import metrics all glyphs"
            title="Import metrics for every glyph from the reference font."
          >
            <MoritzLabel text="Import all" size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Set left and right side bearings to 0 for ALL glyphs in this font?')) return;
              updateAllGlyphs((g) => ({ ...g, sidebearings: { left: 0, right: 0 } }));
              setActionsOpen(false);
            }}
            aria-label="Zero all bearings"
            title="Set left and right side bearings to 0 for every glyph."
          >
            <MoritzLabel text="Zero bearings" size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              updateGlyph((g) => ({
                ...g,
                animator: g.animator ?? defaultGlyphAnimator(g),
              }));
              props.onSelectAnimator();
              setActionsOpen(false);
            }}
            aria-label={glyph.animator ? 'Select animator' : 'Add animator'}
            title={glyph.animator ? 'Select the glyph animator cObject.' : 'Add an animator component to this glyph.'}
          >
            <MoritzLabel text={glyph.animator ? 'Select animator' : 'Add animator'} size={12} />
          </button>
        </ActionsPopover>
      )}
      <NumSlider
        label="Box width"
        min={20}
        max={300}
        step={1}
        value={glyph.box.w}
        onChange={(v) =>
          updateGlyph((g) => {
            const newW = Math.round(v);
            const dx = (newW - g.box.w) / 2;
            if (dx === 0) return { ...g, box: { ...g.box, w: newW } };
            return {
              ...g,
              box: { ...g.box, w: newW },
              strokes: g.strokes.map((s) => ({
                ...s,
                vertices: s.vertices.map((vx) => ({
                  ...vx,
                  p: { x: vx.p.x + dx, y: vx.p.y },
                })),
              })),
            };
          })
        }
        tooltip="Width of this glyph's ink box in font units. Grows symmetrically: stroke vertices shift by half the delta so artwork stays centred."
      />
      <NumSlider
        label="Box height"
        min={20}
        max={300}
        step={1}
        value={glyph.box.h}
        onChange={(v) =>
          updateGlyph((g) => {
            const newH = Math.round(v);
            const dy = (newH - g.box.h) / 2;
            if (dy === 0) return { ...g, box: { ...g.box, h: newH } };
            return {
              ...g,
              box: { ...g.box, h: newH },
              strokes: g.strokes.map((s) => ({
                ...s,
                vertices: s.vertices.map((vx) => ({
                  ...vx,
                  p: { x: vx.p.x, y: vx.p.y + dy },
                })),
              })),
            };
          })
        }
        tooltip="Height of this glyph's ink box in font units. Grows symmetrically (same as Box width)."
      />
      <NumSlider
        label="Left bearing"
        min={-40}
        max={80}
        step={1}
        value={glyph.sidebearings?.left ?? 0}
        onChange={(v) =>
          updateGlyph((g) => ({
            ...g,
            sidebearings: { left: Math.round(v), right: g.sidebearings?.right ?? 0 },
          }))
        }
        tooltip="Extra horizontal padding before the glyph (font units). Negative lets the previous glyph encroach."
      />
      <NumSlider
        label="Right bearing"
        min={-40}
        max={80}
        step={1}
        value={glyph.sidebearings?.right ?? 0}
        onChange={(v) =>
          updateGlyph((g) => ({
            ...g,
            sidebearings: { left: g.sidebearings?.left ?? 0, right: Math.round(v) },
          }))
        }
        tooltip="Extra horizontal padding after the glyph (font units). Negative tightens the next glyph against this one."
      />
      <NumSlider
        label="Baseline ↕"
        min={-60}
        max={60}
        step={1}
        value={glyph.baselineOffset ?? 0}
        onChange={(v) => updateGlyph((g) => ({ ...g, baselineOffset: Math.round(v) }))}
        tooltip="Vertical offset relative to the baseline. Positive moves the glyph down."
      />
      <NumSlider
        label="World blend Δ"
        min={-Math.PI / 2}
        max={Math.PI / 2}
        step={0.01}
        value={glyph.worldAngleOffset ?? 0}
        onChange={(v) => updateGlyph((g) => ({ ...g, worldAngleOffset: v }))}
        tooltip="Per-glyph offset added to the typeface's World blend angle. Saved with the font."
      />
      <NumSlider
        label="World contract Δ"
        min={-Math.PI / 2}
        max={Math.PI / 2}
        step={0.01}
        value={glyph.worldContractAngleOffset ?? 0}
        onChange={(v) => updateGlyph((g) => ({ ...g, worldContractAngleOffset: v }))}
        tooltip="Per-glyph offset added to the typeface's World contract angle. Saved with the font."
      />
    </div>
  );
}

function defaultGlyphAnimator(glyph: Glyph): GlyphAnimatorComponent {
  return {
    id: 'animator',
    kind: 'symbol-along-stroke',
    symbols: [{ id: 'dot' }],
    ...(glyph.strokes[0] ? { strokeIds: [glyph.strokes[0].id] } : {}),
    samplesPerSegment: 16,
    speed: 0.12,
    loop: true,
    easing: 'linear',
  };
}

/** Compact popover for secondary actions. Closes on outside click or Esc. */
function ActionsPopover(props: {
  onClose: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocDown = (e: MouseEvent): void => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [props]);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 18,
        right: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        minWidth: 200,
        background: 'var(--mz-panel)',
        border: '1px solid var(--mz-line)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      }}
    >
      {props.children}
    </div>
  );
}

// ---------- Left-column tab bar -------------------------------------------

function LeftTabBar(props: {
  value: 'glyphs' | 'kerning' | 'settings';
  onChange: (v: 'glyphs' | 'kerning' | 'settings') => void;
}): JSX.Element {
  const bind = useMgElement({
    id: 'moritz.glyphsetter.leftTabs',
    role: 'tabs',
    label: 'GlyphSetter left tabs',
    tone: 'relevant',
    importance: 1,
    closeness: 'controlInternal',
  });
  const tab = (id: 'glyphs' | 'kerning' | 'settings', label: string): JSX.Element => {
    const active = props.value === id;
    return (
      <button
        type="button"
        data-active={active ? 'true' : 'false'}
        data-tab={id}
        onClick={() => props.onChange(id)}
        style={{
          flex: 1,
          padding: '6px 8px',
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          background: active ? 'color-mix(in srgb, var(--mg-tone-relevant) 12%, transparent)' : 'transparent',
          color: active ? 'var(--mg-tone-relevant)' : 'var(--mg-text-muted)',
          border: 'none',
          borderBottom: active ? '2px solid var(--mg-tone-relevant)' : '2px solid transparent',
          cursor: 'pointer',
        }}
        aria-label={label}
        title={label}
      >
        <MoritzLabel text={label} size={11} />
      </button>
    );
  };
  return (
    <div
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: 0,
        minHeight: 32,
        borderBottom: '1px solid var(--mg-line)',
        background: 'var(--mg-surface-0)',
        color: 'var(--mg-text)',
        fontSize: 12,
      }}
    >
      {tab('glyphs', 'Glyphs')}
      {tab('kerning', 'Kerning')}
      {tab('settings', 'Settings')}
    </div>
  );
}

// ---------- Kerning list (typeface-wide, in left column) ------------------

function KerningList(props: {
  font: Font;
  pairs: Readonly<Record<string, number>>;
  onChange: (next: Record<string, number>) => void;
  refFontFamily: string;
}): JSX.Element {
  const { font, pairs, onChange, refFontFamily } = props;
  const [draft, setDraft] = useState('');
  const focusPair = useAppStore((s) => s.kerningFocusPair);
  const setFocusPair = useAppStore((s) => s.setKerningFocusPair);
  const focusRef = useRef<HTMLDivElement | null>(null);
  // Scroll the focused pair into view once it's mounted, then clear the
  // focus signal so the highlight only fires for the explicit jump.
  // Wrapped in two rAFs so the entry's DOM node is fully laid out before
  // we scroll \u2014 KerningList may have just been mounted by the click
  // that set `focusPair`, in which case the first paint hasn't happened.
  useEffect(() => {
    if (!focusPair) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const node = focusRef.current;
        if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
    const timer = window.setTimeout(() => setFocusPair(undefined), 2500);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [focusPair, setFocusPair]);

  const entries = Object.entries(pairs).sort(([a], [b]) => a.localeCompare(b));

  const setValue = (pair: string, v: number): void => {
    onChange({ ...pairs, [pair]: v });
  };
  const remove = (pair: string): void => {
    const next = { ...pairs };
    delete next[pair];
    onChange(next);
  };
  const add = (): void => {
    const chars = [...draft];
    if (chars.length !== 2) return;
    const a = chars[0]!;
    const b = chars[1]!;
    if (!font.glyphs[a] || !font.glyphs[b]) return;
    const key = a + b;
    if (pairs[key] !== undefined) return;
    setValue(key, 0);
    setDraft('');
  };

  const canAdd = (() => {
    const chars = [...draft];
    if (chars.length !== 2) return false;
    const a = chars[0]!;
    const b = chars[1]!;
    return !!font.glyphs[a] && !!font.glyphs[b] && pairs[a + b] === undefined;
  })();

  const importFromRef = (): void => {
    const extracted = extractKerningFromReference(font, refFontFamily);
    onChange({ ...pairs, ...extracted });
  };

  return (
    <div
      className="mz-kerning-list"
      style={{
        position: 'absolute',
        inset: 0,
        padding: 8,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        // Outer container no longer scrolls â€” only the entries list does,
        // so the "+ Pair" input stays pinned at the top.
        overflow: 'hidden',
      }}
    >
      <div
        className="mz-kerning-list__sticky"
        style={{
          // Sticky header: stays at the top while entries below scroll.
          // Background prevents entries from showing through during scroll.
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingBottom: 6,
          borderBottom: '1px solid var(--mz-line)',
          background: 'inherit',
        }}
      >
        <div
          className="mz-kerning-list__add"
          title="Type a two-character pair and click +Pair to add a new entry."
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--mz-text)',
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2))}
            placeholder="AV"
            maxLength={2}
            title="Two-character pair (e.g. AV). Both characters must exist in the font."
            style={{
              width: 50,
              padding: '2px 4px',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            title="Add this pair with delta 0."
            style={{ padding: '2px 8px' }}
          >
            + Pair
          </button>
          <span style={{ color: 'var(--mz-text-mute)', marginLeft: 'auto' }}>
            {entries.length} pair{entries.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          onClick={importFromRef}
          disabled={!refFontFamily}
          title={
            refFontFamily
              ? `Measure every pair of glyphs in your font with "${refFontFamily}" and write the kerning differences. Existing pairs are overwritten when the reference font has a non-zero kern for them.`
              : 'Set a reference font in the View panel first.'
          }
          style={{ padding: '4px 8px', fontSize: 12 }}
        >
          Import kerning from reference font
        </button>
      </div>
      <div
        className="mz-kerning-list__entries"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingTop: 6,
        }}
      >
        {entries.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--mz-text-mute)', margin: '4px 0' }}>
            No kerning pairs. Type two characters above and click + Pair.
          </p>
        )}
        {entries.map(([pair, value]) => (
          <div
            key={pair}
            ref={pair === focusPair ? focusRef : undefined}
            className={pair === focusPair ? 'mz-kern-focus' : undefined}
            style={
              pair === focusPair
                ? {
                    outline: '3px solid #f0a020',
                    outlineOffset: 2,
                    borderRadius: 4,
                    background: 'rgba(240,160,32,0.18)',
                    animation: 'mzKernPulse 0.6s ease-out 3',
                  }
                : undefined
            }
          >
            <KerningEntry
              pair={pair}
              value={value}
              font={font}
              onChange={(v) => setValue(pair, v)}
              onRemove={() => remove(pair)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function KerningEntry(props: {
  pair: string;
  value: number;
  font: Font;
  onChange: (v: number) => void;
  onRemove: () => void;
}): JSX.Element {
  const { pair, value, font, onChange, onRemove } = props;
  const [a, b] = [...pair];

  // Live preview: layout the two glyphs through the actual pipeline with this
  // pair's current value (overriding font.kerning so the slider reflects
  // immediately even before commit).
  const previewSvg = useMemo(() => {
    if (!a || !b) return null;
    if (!font.glyphs[a] || !font.glyphs[b]) return null;
    const previewFont: Font = {
      ...font,
      kerning: { ...(font.kerning ?? {}), [pair]: value },
    };
    const result = layoutText(a + b, previewFont);
    if (result.glyphs.length === 0) return null;

    const groups = result.glyphs.map(({ glyph, origin }) => ({
      origin,
      paths: glyph.strokes.map((s, i) => {
        const { polygon, triangles } = triangulateForStyle(s, effectiveStyleForGlyph(font.style, glyph), {
          instanceIndex: i,
          char: glyph.char,
        }, glyph.box.h);
        return trianglesD(polygon, triangles);
      }),
    }));

    const w = result.width || 1;
    const h = result.height || 1;
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: 'block',
          width: '100%',
          height: 56,
          background: 'var(--mz-paper)',
          border: '1px solid var(--mz-line)',
          borderRadius: 3,
        }}
      >
        <g fill="var(--mz-ink)">
          {groups.map((grp, gi) => (
            <g key={gi} transform={`translate(${grp.origin.x} ${grp.origin.y})`}>
              {grp.paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          ))}
        </g>
      </svg>
    );
  }, [a, b, pair, value, font]);

  return (
    <div
      className="mz-kerning-entry"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        background: 'var(--mz-panel)',
        border: '1px solid var(--mz-line)',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--mz-text)',
        }}
      >
        <code
          style={{ width: 36, fontFamily: 'monospace', fontSize: 14 }}
          title={`Pair: "${pair}"`}
        >
          {pair}
        </code>
        <input
          type="range"
          min={-80}
          max={80}
          step={1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          title="Kerning offset (font units). Negative tightens, positive opens up."
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          type="number"
          value={value}
          step={1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          title="Kerning offset (font units)."
          style={{
            width: 52,
            padding: '2px 4px',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button
          type="button"
          onClick={onRemove}
          title="Remove this pair."
          style={{ padding: '0 6px', fontSize: 11 }}
        >
          Ã—
        </button>
      </div>
      {previewSvg}
    </div>
  );
}

function Section(props: {
  title: string;
  tone: 'local' | 'style' | 'glyphfont';
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  const isStyle = props.tone === 'style';
  const isFont = props.tone === 'glyphfont';
  const modClass = isStyle
    ? ' mz-mod--stylesetter'
    : isFont
      ? ' mz-mod--glyphfont'
      : '';
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section
      className={`mz-inspector__section mz-inspector__section--${props.tone}${modClass}`}
      style={{
        border: `1px solid var(--mz-line)`,
        borderRadius: 4,
        background: isStyle || isFont ? 'var(--mz-panel)' : 'var(--mz-panel)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <header
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 10,
            color: isStyle || isFont ? 'var(--mz-accent)' : 'var(--mz-text-mute)',
            width: 10,
            display: 'inline-block',
          }}
        >
          {open ? 'â–¾' : 'â–¸'}
        </span>
        <strong
          style={{
            fontSize: 12,
            color: isStyle || isFont ? 'var(--mz-accent)' : 'var(--mz-text)',
          }}
        >
          <MoritzLabel text={props.title} size={12} />
        </strong>
        {props.subtitle && (
          <span style={{ fontSize: 11, color: 'var(--mz-text-mute)' }}>
            <MoritzLabel text={props.subtitle} size={11} />
          </span>
        )}
      </header>
      {open && props.children}
    </section>
  );
}

function Check(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tooltip?: string;
}): JSX.Element {
  return (
    <label
      title={props.tooltip}
      style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <MoritzLabel text={props.label} size={11} />
    </label>
  );
}

// Curated set of common system / web fonts spanning the major design idioms
// (humanist sans, geometric sans, neutral sans, slab, didone, transitional,
// monospace, blackletter, comic). Each entry uses a fallback chain so the
// browser can substitute close cousins.
const REF_FONTS: readonly { label: string; family: string }[] = [
  { label: 'Arial / Helvetica', family: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', family: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif' },
  { label: 'Calibri Segoe UI', family: 'Calibri, "Segoe UI", sans-serif' },
  { label: 'Futura Avenir', family: 'Futura, "Avenir Next", Avenir, sans-serif' },
  { label: 'Times Serif', family: '"Times New Roman", Times, serif' },
  { label: 'Georgia', family: 'Georgia, serif' },
  { label: 'Garamond', family: 'Garamond, "Apple Garamond", serif' },
  { label: 'Didot Bodoni', family: 'Didot, "Bodoni MT", serif' },
  { label: 'Courier mono', family: '"Courier New", Courier, monospace' },
  { label: 'Consolas mono', family: 'Consolas, "Lucida Console", monospace' },
  { label: 'Comic Sans', family: '"Comic Sans MS", "Chalkboard SE", cursive' },
  { label: 'Impact', family: 'Impact, "Arial Black", sans-serif' },
];

function RefFontPicker(props: {
  family: string;
  opacity: number;
  onChange: (patch: { refFontFamily?: string; refFontOpacity?: number }) => void;
}): JSX.Element {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}
      title="Trace a real system font behind the glyph for reference. Pick from a curated set; the chosen font's matching character is rendered faintly behind your strokes."
    >
      <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 80, color: 'var(--mz-text-mute)' }}>
          <MoritzLabel text="Reference" size={11} />
        </span>
        <MoritzSelect
          value={props.family}
          options={[
            { value: '', label: 'none' },
            ...REF_FONTS.map((font) => ({
              value: font.family,
              label: font.label,
            })),
          ]}
          onChange={(refFontFamily) => props.onChange({ refFontFamily })}
          style={{ flex: 1 }}
        />
      </div>
      {props.family && (
        <NumSlider
          label="Ref opacity"
          min={0}
          max={1}
          step={0.01}
          value={props.opacity}
          onChange={(v) => props.onChange({ refFontOpacity: v })}
          tooltip="How visible the reference font is behind the edited glyph (0 = invisible, 1 = solid black)."
        />
      )}
    </div>
  );
}

function NumSlider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  tooltip?: string;
}): JSX.Element {
  const fmt = props.format ?? ((v: number) => v.toFixed(2));
  return (
    <div
      title={props.tooltip}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
    >
      <span style={{ color: 'var(--mz-text-mute)', width: 80, flexShrink: 0 }}>
        <MoritzLabel text={props.label} size={11} />
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
          width: 52,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          padding: '1px 4px',
        }}
        title={fmt(props.value)}
      />
    </div>
  );
}

// ---------- Per-stroke overlay ---------------------------------------------

export function StrokeOverlay(props: {
  stroke: Stroke;
  strokeIdx: number;
  selection: Selection;
  showAnchors: boolean;
  scale: number;
  profile: WidthProfile;
  onStrokePointerDown: (e: React.PointerEvent, strokeIdx: number) => void;
  onAnchorPointerDown: (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => void;
  onHandlePointerDown: (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
    side: 'in' | 'out',
  ) => void;
  onNormalPointerDown: (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => void;
}): JSX.Element {
  const { stroke, strokeIdx, selection, showAnchors, scale, profile } = props;
  const segs = strokeToSegments(stroke);
  const isStrokeSelected =
    (selection.kind === 'stroke' && selection.strokeIdx === strokeIdx) ||
    (selection.kind === 'anchor' && selection.strokeIdx === strokeIdx) ||
    (selection.kind === 'multi' && selection.strokeIdxs.includes(strokeIdx));

  const d = useMemo(() => {
    if (segs.length === 0) return '';
    const parts: string[] = [];
    parts.push(`M ${segs[0]!.p0.x} ${segs[0]!.p0.y}`);
    for (const seg of segs) {
      parts.push(
        `C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.p1.x} ${seg.p1.y}`,
      );
    }
    return parts.join(' ');
  }, [segs]);

  // Sizes are in glyph units; divide by editor scale so they stay constant on screen.
  const ANCHOR = 8 / scale;
  const HANDLE = 6 / scale;
  const HAIR = 2 / scale;

  // Per-vertex default normal handle position (perp(tangent) Ã— bare default
  // half-width at that anchor's arc-length parameter). When a vertex has a
  // normalOverride, the handle sits at p + override; otherwise at the
  // default. Pure function of (segs, profile) â€” no React state.
  const normalHandles = useMemo<readonly Vec2[]>(() => {
    if (segs.length === 0) return stroke.vertices.map((v) => ({ x: v.p.x, y: v.p.y }));
    const lens = segs.map(
      (s) => Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) || 1,
    );
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    const cum: number[] = [0];
    for (let i = 0; i < lens.length; i++) cum.push(cum[i]! + lens[i]!);
    return stroke.vertices.map((v, k) => {
      if (v.normalOverride) {
        return { x: v.p.x + v.normalOverride.x, y: v.p.y + v.normalOverride.y };
      }
      const tIn = k > 0 ? tangentAt(segs[k - 1]!, 1) : { x: 0, y: 0 };
      const tOut = k < segs.length ? tangentAt(segs[k]!, 0) : { x: 0, y: 0 };
      let avg: Vec2;
      if (k === 0) avg = tOut;
      else if (k === segs.length) avg = tIn;
      else avg = { x: tIn.x + tOut.x, y: tIn.y + tOut.y };
      const len = Math.hypot(avg.x, avg.y) || 1;
      const nx = -avg.y / len;
      const ny = avg.x / len;
      const tArc = cum[k]! / total;
      const half = widthAt(profile, tArc) / 2;
      return { x: v.p.x + nx * half, y: v.p.y + ny * half };
    });
  }, [segs, stroke.vertices, profile]);

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={isStrokeSelected ? 'var(--mz-glyph-accent)' : 'var(--mz-text-mute)'}
        strokeWidth={HAIR}
        onPointerDown={(e) => props.onStrokePointerDown(e, strokeIdx)}
        style={{ cursor: isStrokeSelected ? 'grabbing' : 'grab' }}
      />
      {showAnchors && stroke.vertices.map((v, vIdx) => {
        const sel =
          selection.kind === 'anchor' &&
          selection.strokeIdx === strokeIdx &&
          selection.vIdx === vIdx;
        const inAbs = { x: v.p.x + v.inHandle.x, y: v.p.y + v.inHandle.y };
        const outAbs = { x: v.p.x + v.outHandle.x, y: v.p.y + v.outHandle.y };
        return (
          <g key={vIdx}>
            {sel && (v.inHandle.x !== 0 || v.inHandle.y !== 0) && (
              <>
                <line
                  x1={v.p.x}
                  y1={v.p.y}
                  x2={inAbs.x}
                  y2={inAbs.y}
                  stroke="var(--mz-glyph-accent)"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={inAbs.x}
                  cy={inAbs.y}
                  r={HANDLE}
                  fill="var(--mz-glyph-bg)"
                  stroke="var(--mz-glyph-accent)"
                  strokeWidth={HAIR / 2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) =>
                    props.onHandlePointerDown(e, strokeIdx, vIdx, 'in')
                  }
                />
              </>
            )}
            {sel && (v.outHandle.x !== 0 || v.outHandle.y !== 0) && (
              <>
                <line
                  x1={v.p.x}
                  y1={v.p.y}
                  x2={outAbs.x}
                  y2={outAbs.y}
                  stroke="var(--mz-glyph-accent)"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={outAbs.x}
                  cy={outAbs.y}
                  r={HANDLE}
                  fill="var(--mz-glyph-bg)"
                  stroke="var(--mz-glyph-accent)"
                  strokeWidth={HAIR / 2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) =>
                    props.onHandlePointerDown(e, strokeIdx, vIdx, 'out')
                  }
                />
              </>
            )}
            {sel && (() => {
              const nh = normalHandles[vIdx]!;
              const hasOverride = v.normalOverride !== undefined;
              return (
                <>
                  <line
                    x1={v.p.x}
                    y1={v.p.y}
                    x2={nh.x}
                    y2={nh.y}
                    stroke="#e6b800"
                    strokeWidth={HAIR / 2}
                    strokeDasharray={hasOverride ? undefined : `${HAIR * 1.5} ${HAIR * 1.5}`}
                  />
                  <circle
                    cx={nh.x}
                    cy={nh.y}
                    r={HANDLE}
                    fill={hasOverride ? '#e6b800' : '#fff'}
                    stroke="#e6b800"
                    strokeWidth={HAIR / 2}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) =>
                      props.onNormalPointerDown(e, strokeIdx, vIdx)
                    }
                  >
                    <title>
                      {hasOverride
                        ? 'Normal override (drag to reshape, shift+click to clear)'
                        : 'Default normal (drag to override; shift+click no-op)'}
                    </title>
                  </circle>
                </>
              );
            })()}
            <rect
              x={v.p.x - ANCHOR / 2}
              y={v.p.y - ANCHOR / 2}
              width={ANCHOR}
              height={ANCHOR}
              fill={sel ? 'var(--mz-glyph-accent)' : 'var(--mz-glyph-bg)'}
              stroke={sel ? 'var(--mz-glyph-accent)' : 'var(--mz-glyph-line)'}
              strokeWidth={HAIR / 2}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) =>
                props.onAnchorPointerDown(e, strokeIdx, vIdx)
              }
            />
          </g>
        );
      })}
    </g>
  );
}

// ---------- helpers ---------------------------------------------------------

// SINGLE SOURCE OF TRUTH for the rendered fill: build the path d from the
// SAME triangle list the debug overlay uses, so the visible shape is
// literally the union of those triangles.
function trianglesD(
  poly: readonly Vec2[],
  triangles: readonly (readonly [number, number, number])[],
): string {
  let d = '';
  for (const t of triangles) {
    const a = poly[t[0]]!;
    const b = poly[t[1]]!;
    const c = poly[t[2]]!;
    d += `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z `;
  }
  return d;
}

/**
 * Triangulate one stroke using the active style's triMode. Single source of
 * truth: the editor canvas, thumbnail grid, and SVG export all funnel
 * through this OR the matching helper in `core/export/svg.ts`.
 *
 * When `ctx` is supplied, the polygon is also passed through shape-jitter
 * (matching the StyleSetter / TypeSetter SVG path). Spline jitter and the
 * affine `transformGlyph` step happen at the GLYPH level â€” see
 * `previewGlyph()` below.
 */
function triangulateForStyle(
  stroke: Stroke,
  style: StyleSettings,
  ctx?: { instanceIndex: number; char: string },
  referenceLength?: number,
): { polygon: readonly Vec2[]; triangles: readonly (readonly [number, number, number])[] } {
  const widthFx = style.effects?.widthWiggle || style.effects?.widthTaper;
  let widthMod = null as ReturnType<typeof makeWidthMod>;
  if (widthFx && ctx) {
    const segs = strokeToSegments(stroke);
    let arc = 0;
    for (const s of segs) arc += segmentLength(s);
    widthMod = makeWidthMod(style, ctx, arc);
  }
  const evenness = style.vertexEvenness ?? 0;
  const mode = style.triMode ?? 'earcut';
  let polygon: readonly Vec2[];
  let triangles: readonly (readonly [number, number, number])[];
  let pinned: ReadonlySet<number> = new Set();
  if (mode === 'ribbon-fixed' || mode === 'ribbon-density') {
    const r = triangulateStrokeRibbon(stroke, style, {
      spineSubdiv: ribbonSpineSubdivOf(style),
      borderSubdiv: style.ribbonBorderSubdiv ?? 0,
      capSubdiv: ribbonCapSubdivOf(style),
      brokenAnchorSubdiv: style.ribbonBrokenAnchorSubdiv ?? 0,
      spineLengthAware: ribbonSpineLengthAwareOf(style),
      referenceLength,
    }, widthMod);
    polygon = r.polygon;
    triangles = r.triangles;
    pinned = new Set(r.anchorPolygonIndices);
  } else {
    polygon = outlineStroke(stroke, style, widthMod);
    if (evenness > 0 && polygon.length >= 3) {
      polygon = redistributePolygonEvenly(polygon, evenness);
    }
    triangles = triangulatePolygon(polygon);
  }
  // Relax passes mirror svg.ts so the editor and the export show the
  // same shape. Index list stays valid (vertex count + order preserved).
  const rc = relaxSliderToParams(style.relaxCurves ?? 0);
  if (rc.iterations > 0 && polygon.length >= 3) {
    polygon = relaxCurves(polygon, pinned, rc.strength, rc.iterations);
  }
  const rt = relaxSliderToParams(style.relaxTangents ?? 0);
  if (rt.iterations > 0 && polygon.length >= 3) {
    polygon = relaxTangents(polygon, pinned, rt.strength, rt.iterations);
  }
  // Vertex evenness only runs in earcut mode; ribbon modes have their own
  // arc-length-uniform control (`ribbonSpread`) and resampling would break
  // the strip's index list.
  // Shape jitter is applied AFTER triangulation so the triangle index list
  // stays valid (only point coordinates move). Mirrors svg.ts.
  const shapeJitter = style.effects?.shapeJitter;
  if (ctx && jitterActive(shapeJitter) && polygon.length > 0) {
    const seed = resolveJitterSeed(shapeJitter, ctx, 0x5ec0);
    polygon = jitterPolygon(polygon, shapeJitter, seed);
  }
  return { polygon, triangles };
}

/**
 * Build the glyph the editor should DISPLAY: raw glyph passed through the
 * style's affine (slant / scaleX / scaleY) and per-glyph spline jitter.
 * Editing handles still read from the raw glyph so the user is always
 * manipulating the underlying source.
 */
function previewGlyph(
  raw: Glyph,
  style: StyleSettings,
  ctx: { instanceIndex: number; char: string },
): Glyph {
  const transformed = transformGlyph(style, raw);
  const splineJitter = style.effects?.splineJitter;
  if (jitterActive(splineJitter)) {
    return jitterGlyphSpline(
      transformed,
      splineJitter,
      resolveJitterSeed(splineJitter, ctx, 0x5a17),
    );
  }
  return transformed;
}

function polylineD(points: readonly Vec2[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  return d;
}

/**
 * Project `p` onto the entire stroke and return both the segment index and
 * the parameter `t` of the closest point on that segment. Lets alt-click
 * insert a new anchor exactly at the click position rather than at the
 * segment midpoint.
 */
function nearestPointOnStroke(
  stroke: Stroke,
  p: Vec2,
): { segIdx: number; t: number } | null {
  const segs = strokeToSegments(stroke);
  if (segs.length === 0) return null;
  let best = { segIdx: 0, t: 0.5, d2: Infinity };
  for (let i = 0; i < segs.length; i++) {
    const seg: CubicSegment = segs[i]!;
    const t = closestPointT(seg, p);
    // Reuse pointAt via a local Bernstein eval to avoid an extra import.
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    const x = b0 * seg.p0.x + b1 * seg.c1.x + b2 * seg.c2.x + b3 * seg.p1.x;
    const y = b0 * seg.p0.y + b1 * seg.c1.y + b2 * seg.c2.y + b3 * seg.p1.y;
    const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d2 < best.d2) best = { segIdx: i, t, d2 };
  }
  return { segIdx: best.segIdx, t: best.t };
}
