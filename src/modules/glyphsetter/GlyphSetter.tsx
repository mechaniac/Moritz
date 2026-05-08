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
 * Pipeline order is glyphsetter → stylesetter → typesetter. The GlyphSetter
 * always renders from `font.style` directly; it deliberately ignores the
 * StyleSetter's overlay (`styleOverrides`). Edits made here are the new
 * baseline that StyleSetter and TypeSetter modulate downstream.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { effectiveStyleForGlyph, outlineStroke, redistributePolygonEvenly, resolveWorldWidth, widthAt } from '../../core/stroke.js';
import {
  closestPointT,
  segmentLength,
  strokeToSegments,
  tangentAt,
  type CubicSegment,
} from '../../core/bezier.js';
import { triangulatePolygon } from '../../core/triangulate.js';
import { ribbonDebugSpline0, ribbonDebugSpline1, triangulateStrokeRibbon } from '../../core/ribbon.js';
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
import {
  addStroke,
  clearNormalOverride,
  deleteAnchor,
  deleteStroke,
  insertAnchor,
  makeCorner,
  makeSmooth,
  moveAnchor,
  moveHandle,
  setBreakTangent,
  setNormalOverride,
  translateStroke,
} from '../../core/glyphOps.js';
import {
  ribbonCapSubdivOf,
  ribbonSpineLengthAwareOf,
  ribbonSpineSubdivOf,
  type Font,
  type Glyph,
  type Stroke,
  type StyleSettings,
  type Vec2,
  type WidthProfile,
} from '../../core/types.js';
import { useAppStore } from '../../state/store.js';
import { StyleControls } from '../stylesetter/StyleControls.js';
import { builtInFonts } from '../../data/builtInFonts.js';

const PADDING = 20;

// Reference frame inside the glyph editor — a fixed square the user can
// always see, so adjustments to a glyph's own box read as deviations from
// this default. Picked to match defaultFont's BOX_H (140) so most glyphs
// fit naturally inside it.
const DEFAULT_BOX = 140;

// Fixed widths for the outer columns. Center canvas takes the rest.
const GRID_W = 360;
const INSPECTOR_W = 360;

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
 * via the same em→units scale `importGlyphMetrics` uses (driven by the
 * target glyph's `box.h`).
 *
 * Returns a flat `Record<a+b, delta-in-units>`. Pairs whose absolute
 * delta falls below `threshold` (in font units) are omitted to keep
 * the table sparse — most Latin pairs have zero kerning in most fonts.
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
      // Use the average of both glyphs' box heights as the em→units scale,
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

type Selection =
  | { kind: 'none' }
  | { kind: 'stroke'; strokeIdx: number }
  | { kind: 'anchor'; strokeIdx: number; vIdx: number };

type Drag =
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'handle'; strokeIdx: number; vIdx: number; side: 'in' | 'out' }
  | { kind: 'normal'; strokeIdx: number; vIdx: number }
  | { kind: 'stroke'; strokeIdx: number; lastX: number; lastY: number; moved: boolean };

export function GlyphSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const selectGlyph = useAppStore((s) => s.selectGlyph);
  const updateSelectedGlyph = useAppStore((s) => s.updateSelectedGlyph);
  const updateAllGlyphs = useAppStore((s) => s.updateAllGlyphs);
  const view = useAppStore((s) => s.glyphView);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  const setStyle = useAppStore((s) => s.setStyle);
  const setKerning = useAppStore((s) => s.setKerning);

  const glyph = font.glyphs[selectedChar];

  const [leftTab, setLeftTab] = useState<'glyphs' | 'kerning'>('glyphs');

  return (
    <div
      className="mz-glyphsetter"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: GRID_W,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#2a2a2a',
        }}
      >
        <LeftTabBar value={leftTab} onChange={setLeftTab} />
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {leftTab === 'glyphs' ? (
            <GlyphGrid
              chars={Object.keys(font.glyphs)}
              selected={selectedChar}
              onSelect={selectGlyph}
              font={font}
              view={view}
            />
          ) : (
            <KerningList
              font={font}
              pairs={font.kerning ?? {}}
              onChange={setKerning}
              refFontFamily={view.refFontFamily}
            />
          )}
        </div>
      </div>
      <div
        className="mz-glyphsetter__editor"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: GRID_W,
          right: INSPECTOR_W,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #999',
          borderRight: '1px solid #999',
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
          />
        ) : (
          <p style={{ padding: 16 }}>No glyph selected.</p>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: INSPECTOR_W,
          overflow: 'hidden',
        }}
      >
        <Inspector
          view={view}
          setView={setGlyphView}
          style={font.style}
          setStyle={setStyle}
          glyph={glyph}
          updateGlyph={updateSelectedGlyph}
          updateAllGlyphs={updateAllGlyphs}
          original={builtInFonts.find((f) => f.id === font.id)?.style}
        />
      </div>
    </div>
  );
}

// ---------- Sidebar: glyph grid --------------------------------------------

/** Pixels per font unit in the grid thumbnails. Fixed so all glyphs render at
 *  the same zoom level — the grid wraps and tiles take their natural size. */
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
        position: 'absolute',
        inset: 0,
        padding: 8,
        overflowY: 'auto',
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
                  background: active ? '#222' : '#fff',
                  color: active ? '#fff' : '#222',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'block',
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
                  color: '#999',
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
      <g fill="currentColor">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ---------- Editor (canvas column) -----------------------------------------

function GlyphEditor(props: {
  char: string;
  glyph: Glyph;
  onChange: (fn: (g: Glyph) => Glyph) => void;
  view: GlyphViewOptions;
  setView: (patch: Partial<GlyphViewOptions>) => void;
  font: Font;
}): JSX.Element {
  const { char, glyph, onChange, view, font } = props;
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const SCALE = view.editorScale;
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Glyph as it would render in the StyleSetter / TypeSetter, i.e. with the
  // style's affine (slant, scaleX, scaleY) and per-glyph spline jitter
  // applied. The raw `glyph` is still used for editing handles / hit
  // testing — only the visual previews (fill, debug border, triangulation
  // overlay) use this transformed copy so the user sees the final look.
  const displayGlyph = useMemo(
    () => previewGlyph(glyph, font.style, { instanceIndex: 0, char }),
    [glyph, font.style, char],
  );
  const gStyle = useMemo(() => effectiveStyleForGlyph(font.style, glyph), [font.style, glyph]);

  const viewW = Math.max(DEFAULT_BOX, glyph.box.w) * SCALE + PADDING * 2;
  const viewH = Math.max(DEFAULT_BOX, glyph.box.h) * SCALE + PADDING * 2;

  // The glyph's strokes are anchored to the glyph's own box (so the artwork
  // always sits inside the solid rectangle in the editor — same as the grid
  // and the StyleSetter preview). The default-box outline is a separate
  // reference frame, drawn centred on the canvas for orientation.
  const cx = viewW / 2;
  const cy = viewH / 2;
  const gBoxX = cx - (glyph.box.w * SCALE) / 2;
  const gBoxY = cy - (glyph.box.h * SCALE) / 2;
  const originX = gBoxX; // glyph (0,0) on screen
  const originY = gBoxY;
  const defBoxX = cx - (DEFAULT_BOX * SCALE) / 2;
  const defBoxY = cy - (DEFAULT_BOX * SCALE) / 2;
  const xform = `translate(${originX} ${originY}) scale(${SCALE})`;

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
    const p = toGlyph(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'anchor') {
      onChange((g) => moveAnchor(g, drag.strokeIdx, drag.vIdx, p));
    } else if (drag.kind === 'handle') {
      onChange((g) => moveHandle(g, drag.strokeIdx, drag.vIdx, drag.side, p));
    } else if (drag.kind === 'normal') {
      onChange((g) => setNormalOverride(g, drag.strokeIdx, drag.vIdx, p));
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
    if (dragRef.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
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
  const onDeleteSelected = () => {
    if (selection.kind === 'anchor') {
      onChange((g) => deleteAnchor(g, selection.strokeIdx, selection.vIdx));
      setSelection({ kind: 'none' });
    } else if (selection.kind === 'stroke') {
      onChange((g) => deleteStroke(g, selection.strokeIdx));
      setSelection({ kind: 'none' });
    }
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

  return (
    <>
      {/* Canvas — fills remaining space. The editing toolbar is anchored
          to (and exactly the width of) the .mz-glyph-canvas SVG so it
          tracks the artwork rather than the column. */}
      <div
        className="mz-glyphsetter__canvas"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          background: 'transparent',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8,
        }}
      >
        <div
          className="mz-glyphsetter__toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 10px',
            border: '1px solid #bbb',
            borderRadius: 6,
            background: '#eaeaea',
            fontSize: 13,
            flexShrink: 0,
            width: viewW,
            boxSizing: 'border-box',
            minHeight: 32,
          }}
        >
          <strong style={{ fontSize: 14, width: 90, flexShrink: 0 }}>
            Editing: {char}
          </strong>
          <button onClick={onAddStroke}>+ Stroke</button>
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
            disabled={selection.kind === 'none'}
            title="Insert a new anchor at the midpoint of the segment after the selected anchor (or in the middle of the selected stroke). Tip: alt-click a stroke to insert at the click point."
          >
            + Anchor
          </button>
          <button onClick={onDeleteSelected} disabled={selection.kind === 'none'}>
            − Delete selected
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
            Break tangent
          </label>
          <span
            style={{ color: '#666', fontSize: 11, marginLeft: 'auto' }}
            title="Drag anchors / handles. Drag stroke body = move whole stroke. Alt-click stroke = insert anchor. Alt-click anchor = toggle corner/smooth."
          >
            (?)
          </span>
        </div>
        <svg
          ref={svgRef}
          className="mz-glyph-canvas"
          viewBox={`0 0 ${viewW} ${viewH}`}
          width={viewW}
          height={viewH}
          style={{ display: 'block', touchAction: 'none', flexShrink: 0 }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* background — clicking empty space deselects */}
          <rect
            x={0}
            y={0}
            width={viewW}
            height={viewH}
            fill="#ffffff"
            onPointerDown={() => setSelection({ kind: 'none' })}
          />
          {/* default box — a fixed square reference frame so adjustments
              to the current glyph box read as deviations from default */}
          <rect
            className="mz-default-box"
            x={defBoxX}
            y={defBoxY}
            width={DEFAULT_BOX * SCALE}
            height={DEFAULT_BOX * SCALE}
            fill="none"
            stroke="#bbb"
            strokeDasharray="6 4"
            strokeWidth={1}
            pointerEvents="none"
          />
          {/* glyph box — the 'sheet' the character sits on. No fill so the
              default-box reference frame stays visible at all times. */}
          <rect
            className="mz-glyph-box"
            x={gBoxX}
            y={gBoxY}
            width={glyph.box.w * SCALE}
            height={glyph.box.h * SCALE}
            fill="none"
            stroke="#444"
            strokeWidth={1}
            pointerEvents="none"
          />
          {/* reference font (system/web font) traced behind the ink. The
              baseline + cap- or x-height are read from the first visible
              calligraphy guide layer (if any); otherwise it falls back to
              the glyph box. We assume the browser font has cap-height ≈
              0.70em and x-height ≈ 0.50em, which is true for nearly all
              the curated families. */}
          {view.refFontFamily && (() => {
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
                fill="#000"
                opacity={view.refFontOpacity}
                pointerEvents="none"
                style={{ userSelect: 'none' }}
              >
                {char}
              </text>
            );
          })()}
          {/* sidebearing guides — vertical lines indicating advance edges */}
          {(() => {
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
                  stroke="#222"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <line
                  x1={xRight}
                  x2={xRight}
                  y1={y0}
                  y2={y1}
                  stroke="#222"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              </g>
            );
          })()}
          {/* guides — anchored to the *default* box reference frame, so they
              never slide when the glyph's own box.{w,h} changes. */}
          {view.guides.enabled && (
            <g
              transform={`translate(${defBoxX} ${defBoxY}) scale(${SCALE})`}
              pointerEvents="none"
            >
              {view.guides.layers.map((l) => {
                if (!l.visible) return null;
                const g = computeLayerGeometry(l, DEFAULT_BOX, DEFAULT_BOX);
                const sw = l.strokeWidth / SCALE;
                return (
                  <g key={l.id} stroke={l.color} fill={l.color} opacity={l.opacity}>
                    {g.lines.map((ln, i) => (
                      <line
                        key={`l${i}`}
                        x1={ln.x1}
                        y1={ln.y1}
                        x2={ln.x2}
                        y2={ln.y2}
                        strokeWidth={sw}
                        fill="none"
                      />
                    ))}
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
          {/* other glyphs of the set, faint red — to see how shapes overlap.
              Each glyph is drawn at 5% on its own <g> so opacities accumulate. */}
          {view.showOtherGlyphs && (
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
              fill={`rgba(0,0,0,${view.fillOpacity})`}
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
                    <path d={polylineD(closed)} stroke="#1d6fe6" strokeWidth={sw} />
                    {poly.map((p, k) => (
                      <g key={`v${i}-${k}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={dotR}
                          fill="#1d6fe6"
                          stroke="#fff"
                          strokeWidth={sw * 0.6}
                        />
                        <text
                          x={p.x + dotR * 1.4}
                          y={p.y - dotR * 1.4}
                          fontSize={fontPx}
                          fill="#1d6fe6"
                          stroke="#fff"
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
                            stroke="#ffaa00"
                            strokeWidth={sw}
                            strokeLinecap="round"
                          />
                          {hasIn && (
                            <line
                              x1={a.p.x}
                              y1={a.p.y}
                              x2={inEnd.x}
                              y2={inEnd.y}
                              stroke="#1e90ff"
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
                              stroke="#1e90ff"
                              strokeWidth={sw}
                              strokeLinecap="round"
                            />
                          )}
                          <circle
                            cx={a.p.x}
                            cy={a.p.y}
                            r={r}
                            fill="#1e90ff"
                            stroke="#ffffff"
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
                            stroke="#22dd88"
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
                            fill="#22dd88"
                            stroke="#003322"
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
        </svg>
      </div>
    </>
  );
}

// ---------- Inspector (right column) ---------------------------------------

function Inspector(props: {
  view: GlyphViewOptions;
  setView: (patch: Partial<GlyphViewOptions>) => void;
  style: StyleSettings;
  setStyle: (patch: Partial<StyleSettings>) => void;
  glyph: Glyph | undefined;
  updateGlyph: (fn: (g: Glyph) => Glyph) => void;
  updateAllGlyphs: (fn: (g: Glyph, char: string) => Glyph) => void;
  original?: StyleSettings;
}): JSX.Element {
  const { view, setView, style, setStyle, glyph, updateGlyph, updateAllGlyphs, original } = props;
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
          <NumSlider
            label="Fill opacity"
            min={0}
            max={1}
            step={0.01}
            value={view.fillOpacity}
            onChange={(v) => setView({ fillOpacity: v })}
            tooltip="Opacity of the fill preview (0 = invisible, 1 = solid black)."
          />
        )}
        <Check
          label="Other glyphs (faint)"
          checked={view.showOtherGlyphs}
          onChange={(v) => setView({ showOtherGlyphs: v })}
          tooltip="Overlay every other glyph in the font behind the edited one for visual reference."
        />
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
        <button
          type="button"
          disabled={!glyph}
          onClick={() => {
            if (!glyph) return;
            const spineSubdiv = ribbonSpineSubdivOf(style);
            const borderSubdiv = style.ribbonBorderSubdiv ?? 0;
            const capSubdiv = ribbonCapSubdivOf(style);
            const brokenAnchorSubdiv = style.ribbonBrokenAnchorSubdiv ?? 0;
            const spineLengthAware = ribbonSpineLengthAwareOf(style);
            const dump = {
              char: glyph.char,
              box: glyph.box,
              style: {
                triMode: style.triMode,
                ribbonSpineSubdiv: spineSubdiv,
                ribbonBorderSubdiv: borderSubdiv,
                ribbonCapSubdiv: capSubdiv,
                ribbonBrokenAnchorSubdiv: brokenAnchorSubdiv,
                ribbonSpineLengthAware: spineLengthAware,
                capRoundBulge: style.capRoundBulge,
                capStart: style.capStart,
                capEnd: style.capEnd,
                widthOrientation: style.widthOrientation,
                worldAngle: style.worldAngle,
                worldContractAngle: style.worldContractAngle,
                worldBlend: style.worldBlend,
                worldContract: style.worldContract,
                defaultWidth: style.defaultWidth,
              },
              strokes: glyph.strokes.map((s, i) => {
                const spline0 = ribbonDebugSpline0(s, style);
                const spline1 = ribbonDebugSpline1(s, style, spineSubdiv, null, brokenAnchorSubdiv, spineLengthAware, glyph.box.h);
                const ribbon = triangulateStrokeRibbon(s, style, {
                  spineSubdiv,
                  borderSubdiv,
                  capSubdiv,
                  brokenAnchorSubdiv,
                  spineLengthAware,
                  referenceLength: glyph.box.h,
                });
                // Per-sample summary: spine point, world-blended normal,
                // and the resulting left/right border points.
                const samples = spline1.map((v, k) => ({
                  k,
                  p: v.p,
                  tangent: v.tangent,
                  normal: v.normal,
                  half: v.half,
                  left: { x: v.p.x + v.normal.x * v.half, y: v.p.y + v.normal.y * v.half },
                  right: { x: v.p.x - v.normal.x * v.half, y: v.p.y - v.normal.y * v.half },
                }));
                return {
                  index: i,
                  id: s.id,
                  capStart: s.capStart,
                  capEnd: s.capEnd,
                  width: s.width,
                  vertices: s.vertices,
                  spline0,
                  spline1,
                  samples,
                  ribbon: {
                    polygonCount: ribbon.polygon.length,
                    triangleCount: ribbon.triangles.length,
                    polygon: ribbon.polygon,
                    triangles: ribbon.triangles,
                  },
                };
              }),
            };
            // eslint-disable-next-line no-console
            console.log('[ribbon-debug]', dump);
            // Also print a plain-text summary so you can read it without
            // expanding the live object reference in DevTools.
            for (const sd of dump.strokes) {
              // eslint-disable-next-line no-console
              console.log(
                `[ribbon-debug] stroke #${sd.index} (${sd.id}): ` +
                  `polygonCount=${sd.ribbon.polygonCount}, ` +
                  `triangleCount=${sd.ribbon.triangleCount}`,
              );
              const tbl = sd.samples.map((s) => ({
                k: s.k,
                px: +s.p.x.toFixed(2),
                py: +s.p.y.toFixed(2),
                tx: +s.tangent.x.toFixed(3),
                ty: +s.tangent.y.toFixed(3),
                nx: +s.normal.x.toFixed(3),
                ny: +s.normal.y.toFixed(3),
                half: +s.half.toFixed(2),
              }));
              // eslint-disable-next-line no-console
              console.table(tbl);
            }
            // Also stash on window for ad-hoc inspection in DevTools.
            (window as unknown as { __moritzRibbonDebug?: unknown }).__moritzRibbonDebug = dump;
          }}
          title="Log full ribbon state of the current glyph (spline0, spline1, polygon, triangles) to the browser console. Also stored on window.__moritzRibbonDebug."
          style={{ marginTop: 4 }}
        >
          Log ribbon state
        </button>
        <button
          type="button"
          disabled={!glyph}
          onClick={() => {
            if (!glyph) return;
            const spineSubdiv = ribbonSpineSubdivOf(style);
            const spineLengthAware = ribbonSpineLengthAwareOf(style);
            const referenceLength = glyph.box.h;
            // eslint-disable-next-line no-console
            console.log(
              `[length-aware-diag] glyph='${glyph.char}' triMode=${style.triMode} ` +
                `spineSubdiv=${spineSubdiv} spineLengthAware=${spineLengthAware} ` +
                `referenceLength(box.h)=${referenceLength}`,
            );
            const refStep = referenceLength > 0 ? referenceLength / (spineSubdiv + 1) : 0;
            for (let i = 0; i < glyph.strokes.length; i++) {
              const s = glyph.strokes[i]!;
              const segs = strokeToSegments(s);
              const lens = segs.map(segmentLength);
              const total = lens.reduce((a, b) => a + b, 0) || 1;
              const avg = total / Math.max(1, segs.length);
              const counts = lens.map((l) =>
                spineLengthAware && refStep > 0
                  ? Math.max(0, Math.round(l / refStep) - 1)
                  : spineSubdiv,
              );
              // eslint-disable-next-line no-console
              console.log(
                `[length-aware-diag]  stroke #${i} (${s.id}): segments=${segs.length} ` +
                  `total=${total.toFixed(2)} avg=${avg.toFixed(2)} ` +
                  `refStep=${refStep.toFixed(2)} (= box.h/${spineSubdiv + 1})`,
              );
              const tbl = lens.map((l, k) => ({
                segment: k,
                length: +l.toFixed(3),
                ratioToRef: +(l / referenceLength).toFixed(3),
                fixedCount: spineSubdiv,
                lengthAwareCount: refStep > 0 ? Math.max(0, Math.round(l / refStep) - 1) : spineSubdiv,
                actualCount: counts[k],
              }));
              // eslint-disable-next-line no-console
              console.table(tbl);
            }
          }}
          title="Log per-segment arc lengths and the integer subdivision counts that the length-aware spine option WOULD assign vs the fixed count. Use this to verify whether your current glyph has segments of differing length (a uniform glyph won't visibly change when the toggle flips)."
          style={{ marginTop: 4 }}
        >
          Log length-aware diagnostics
        </button>
        <button
          type="button"
          disabled={!glyph}
          onClick={() => {
            if (!glyph) return;
            // Per-sample world-blend diagnostic. The "snap" is structurally
            // a sign-flip in the chosen world-normal representative: at each
            // sample we pick `wn = sign(tn·worldNormal) * worldNormal`, then
            // slerp `tn → wn` by `blend`. When two adjacent samples sit on
            // opposite sides of the boundary (`tn·worldNormal == 0`) they
            // pick opposite `wn`s and slerp toward different targets,
            // producing a visual fold whose amplitude scales with `blend`.
            // Rows where `wnSign` differs from the previous sample mark
            // exactly where that fold lives.
            const spineSubdiv = ribbonSpineSubdivOf(style);
            const brokenAnchorSubdiv = style.ribbonBrokenAnchorSubdiv ?? 0;
            const spineLengthAware = ribbonSpineLengthAwareOf(style);
            const world = resolveWorldWidth(style);
            // eslint-disable-next-line no-console
            console.log(
              `[world-blend-diag] glyph='${glyph.char}' ` +
                `widthOrientation=${style.widthOrientation} ` +
                `worldAngle=${style.worldAngle} (${((style.worldAngle ?? 0) * 180 / Math.PI).toFixed(1)} deg) ` +
                `worldBlend=${style.worldBlend} ` +
                `worldContract=${style.worldContract} ` +
                `worldNormal=(${world?.normal.x.toFixed(3) ?? 'n/a'}, ${world?.normal.y.toFixed(3) ?? 'n/a'})`,
            );
            if (!world) {
              // eslint-disable-next-line no-console
              console.log('[world-blend-diag] No world component (blend≤0 or orientation=tangent). Nothing to flip.');
              return;
            }
            for (let i = 0; i < glyph.strokes.length; i++) {
              const s = glyph.strokes[i]!;
              const data = ribbonDebugSpline1(s, style, spineSubdiv, null, brokenAnchorSubdiv, spineLengthAware, glyph.box.h);
              if (data.length === 0) continue;
              let prevSign = 0;
              const transitions: number[] = [];
              const tbl = data.map((v, k) => {
                const tn = { x: -v.tangent.y, y: v.tangent.x };
                const dot = tn.x * world.normal.x + tn.y * world.normal.y;
                const wnSign = dot >= 0 ? +1 : -1;
                const wn = { x: world.normal.x * wnSign, y: world.normal.y * wnSign };
                const aT = Math.atan2(tn.y, tn.x);
                const aW = Math.atan2(wn.y, wn.x);
                let diff = aW - aT;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff <= -Math.PI) diff += 2 * Math.PI;
                const aBlend = Math.atan2(v.normal.y, v.normal.x);
                let signChanged = false;
                if (k > 0 && wnSign !== prevSign) {
                  signChanged = true;
                  transitions.push(k);
                }
                prevSign = wnSign;
                return {
                  k,
                  tx: +v.tangent.x.toFixed(3),
                  ty: +v.tangent.y.toFixed(3),
                  tnDotW: +dot.toFixed(4),
                  wnSign,
                  signChanged,
                  blendDeg: +(diff * 180 / Math.PI).toFixed(2),
                  nDeg: +(aBlend * 180 / Math.PI).toFixed(2),
                  nx: +v.normal.x.toFixed(3),
                  ny: +v.normal.y.toFixed(3),
                };
              });
              // eslint-disable-next-line no-console
              console.log(
                `[world-blend-diag]  stroke #${i} (${s.id}): samples=${data.length} ` +
                  `wnSignTransitionsAt=[${transitions.join(',')}] ` +
                  `(those are the fold loci when worldBlend > 0)`,
              );
              // eslint-disable-next-line no-console
              console.table(tbl);
            }
          }}
          title="Log per-sample world-blend resolution: tn·worldNormal, the ± representative chosen, and which sample indices flip the chosen sign relative to their neighbor. Sign-transition rows are exactly where the visual snap appears as you raise worldBlend."
          style={{ marginTop: 4 }}
        >
          Log world-blend normals
        </button>
        <button
          type="button"
          disabled={!glyph}
          onClick={() => {
            if (!glyph) return;
            // Sweep `worldBlend` across {0, .25, .5, .75, 1} and report the
            // largest angular jump between consecutive spine1 normals at
            // each setting. A column whose `maxJumpDeg` grows steeply with
            // blend pinpoints the stroke whose normals snap; rising values
            // typically mean the stroke crosses the world-axis boundary.
            const spineSubdiv = ribbonSpineSubdivOf(style);
            const brokenAnchorSubdiv = style.ribbonBrokenAnchorSubdiv ?? 0;
            const spineLengthAware = ribbonSpineLengthAwareOf(style);
            const blends = [0, 0.25, 0.5, 0.75, 1];
            // eslint-disable-next-line no-console
            console.log(
              `[world-blend-sweep] glyph='${glyph.char}' ` +
                `worldAngle=${style.worldAngle} (${((style.worldAngle ?? 0) * 180 / Math.PI).toFixed(1)} deg) ` +
                `(actual style.worldBlend=${style.worldBlend}; sweep ignores it)`,
            );
            for (let i = 0; i < glyph.strokes.length; i++) {
              const s = glyph.strokes[i]!;
              const rows = blends.map((b) => {
                const probeStyle = { ...style, worldBlend: b, widthOrientation: 'world' as const };
                const data = ribbonDebugSpline1(s, probeStyle, spineSubdiv, null, brokenAnchorSubdiv, spineLengthAware, glyph.box.h);
                if (data.length < 2) return { blend: b, samples: data.length, maxJumpDeg: 0, atK: -1, meanJumpDeg: 0 };
                let maxJump = 0;
                let maxAtK = -1;
                let sumJump = 0;
                for (let k = 1; k < data.length; k++) {
                  const a = data[k - 1]!.normal;
                  const c = data[k]!.normal;
                  const dot = Math.max(-1, Math.min(1, a.x * c.x + a.y * c.y));
                  const ang = Math.acos(dot) * 180 / Math.PI;
                  sumJump += ang;
                  if (ang > maxJump) { maxJump = ang; maxAtK = k; }
                }
                return {
                  blend: b,
                  samples: data.length,
                  maxJumpDeg: +maxJump.toFixed(2),
                  atK: maxAtK,
                  meanJumpDeg: +(sumJump / (data.length - 1)).toFixed(2),
                };
              });
              // eslint-disable-next-line no-console
              console.log(`[world-blend-sweep]  stroke #${i} (${s.id}):`);
              // eslint-disable-next-line no-console
              console.table(rows);
            }
          }}
          title="Recompute spine1 normals for worldBlend ∈ {0,.25,.5,.75,1} (forcing widthOrientation=world) and report the max angular jump between consecutive samples per blend value, per stroke. A row whose maxJumpDeg grows fast as blend rises pinpoints the stroke and the sample index where the snap happens."
          style={{ marginTop: 4 }}
        >
          Sweep world-blend
        </button>
        <RefFontPicker
          family={view.refFontFamily}
          opacity={view.refFontOpacity}
          onChange={setView}
        />
      </Section>
      {glyph && (
        <Section title="Glyph" tone="local" subtitle="Per-glyph metrics">
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              type="button"
              disabled={!view.refFontFamily}
              onClick={() => {
                if (!view.refFontFamily) return;
                updateGlyph((g) => importGlyphMetrics(g, glyph.char, view.refFontFamily));
              }}
              title={
                view.refFontFamily
                  ? "Set this glyph's box width and side bearings from the reference font's measured advance width and ink bounds. Vertical scale matches 'Align to reference font'."
                  : 'Pick a Reference font in the View section first.'
              }
              style={{ flex: 1, fontSize: 11, padding: '2px 6px' }}
            >
              Import (this glyph)
            </button>
            <button
              type="button"
              disabled={!view.refFontFamily}
              onClick={() => {
                if (!view.refFontFamily) return;
                if (!confirm('Import box width and side bearings from the reference font for ALL glyphs? Existing strokes are kept and re-centred.')) return;
                updateAllGlyphs((g, char) => importGlyphMetrics(g, char, view.refFontFamily));
              }}
              title={
                view.refFontFamily
                  ? 'Apply the same metrics import to every glyph in the typeface.'
                  : 'Pick a Reference font in the View section first.'
              }
              style={{ flex: 1, fontSize: 11, padding: '2px 6px' }}
            >
              Import (all glyphs)
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Set left and right side bearings to 0 for ALL glyphs in this font?')) return;
              updateAllGlyphs((g) => ({
                ...g,
                sidebearings: { left: 0, right: 0 },
              }));
            }}
            title="Zero out the left and right side bearings on every glyph. Useful when you want spacing to come purely from box width / tracking / kerning."
            style={{ width: '100%', fontSize: 11, padding: '2px 6px', marginBottom: 4 }}
          >
            Zero all bearings
          </button>
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
            tooltip="Width of this glyph's ink box in font units. The box grows or shrinks symmetrically around the glyph: stroke vertices are shifted by half the delta so the artwork stays visually centred."
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
            tooltip="Height of this glyph's ink box in font units. Grows symmetrically around the glyph (same as Box width)."
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
                sidebearings: {
                  left: Math.round(v),
                  right: g.sidebearings?.right ?? 0,
                },
              }))
            }
            tooltip="Extra horizontal padding before the glyph (font units). Negative values let the previous glyph encroach. Visualised as a dashed blue line."
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
                sidebearings: {
                  left: g.sidebearings?.left ?? 0,
                  right: Math.round(v),
                },
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
            onChange={(v) =>
              updateGlyph((g) => ({ ...g, baselineOffset: Math.round(v) }))
            }
            tooltip="Vertical offset relative to the baseline. Positive moves the glyph down (descender), negative lifts it (superscript-like)."
          />
          <NumSlider
            label="World blend Δangle (rad)"
            min={-Math.PI / 2}
            max={Math.PI / 2}
            step={0.01}
            value={glyph.worldAngleOffset ?? 0}
            onChange={(v) =>
              updateGlyph((g) => ({ ...g, worldAngleOffset: v }))
            }
            tooltip="Per-glyph offset added to the typeface's World blend angle when rendering this glyph. Lets a single glyph lean its nib without touching the StyleSetter value. Saved with the font."
          />
          <NumSlider
            label="World contract Δangle (rad)"
            min={-Math.PI / 2}
            max={Math.PI / 2}
            step={0.01}
            value={glyph.worldContractAngleOffset ?? 0}
            onChange={(v) =>
              updateGlyph((g) => ({ ...g, worldContractAngleOffset: v }))
            }
            tooltip="Per-glyph offset added to the typeface's World contract angle when rendering this glyph. Saved with the font."
          />
        </Section>
      )}
      <Section title="Styles" tone="style" subtitle="Forward to StyleSetter">
        <StyleControls
          style={style}
          setStyle={setStyle}
          {...(original ? { original } : {})}
        />
      </Section>
      <Section title="Guides" tone="local">
        <GuidesPanel
          value={view.guides}
          onChange={(guides) => setView({ guides })}
          refFontFamily={view.refFontFamily}
        />
      </Section>
    </aside>
  );
}

// ---------- Left-column tab bar -------------------------------------------

function LeftTabBar(props: {
  value: 'glyphs' | 'kerning';
  onChange: (v: 'glyphs' | 'kerning') => void;
}): JSX.Element {
  const tab = (id: 'glyphs' | 'kerning', label: string): JSX.Element => {
    const active = props.value === id;
    return (
      <button
        type="button"
        className={`mz-glyphsetter__tab${active ? ' mz-glyphsetter__tab--active' : ''}`}
        data-tab={id}
        onClick={() => props.onChange(id)}
        style={{
          flex: 1,
          padding: '6px 8px',
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          background: active ? '#fff' : 'transparent',
          color: active ? '#222' : '#ccc',
          border: 'none',
          borderBottom: active ? '2px solid #222' : '2px solid transparent',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      className="mz-glyphsetter__tabs"
      style={{
        display: 'flex',
        background: '#1f1f1f',
        borderBottom: '1px solid #111',
      }}
    >
      {tab('glyphs', 'Glyphs')}
      {tab('kerning', 'Kerning')}
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
        // Outer container no longer scrolls — only the entries list does,
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
          borderBottom: '1px solid #2a2a2a',
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
            color: '#ddd',
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
          <span style={{ color: '#888', marginLeft: 'auto' }}>
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
          <p style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>
            No kerning pairs. Type two characters above and click + Pair.
          </p>
        )}
        {entries.map(([pair, value]) => (
          <KerningEntry
            key={pair}
            pair={pair}
            value={value}
            font={font}
            onChange={(v) => setValue(pair, v)}
            onRemove={() => remove(pair)}
          />
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
          background: '#fafafa',
          border: '1px solid #ddd',
          borderRadius: 3,
        }}
      >
        <g fill="#222">
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
        background: '#3a3a3a',
        border: '1px solid #1a1a1a',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: '#eee',
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
          ×
        </button>
      </div>
      {previewSvg}
    </div>
  );
}

function Section(props: {
  title: string;
  tone: 'local' | 'style';
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  const isStyle = props.tone === 'style';
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section
      className={`mz-inspector__section mz-inspector__section--${props.tone}`}
      style={{
        border: `1px solid ${isStyle ? '#c98a2c' : '#bbb'}`,
        borderRadius: 4,
        background: isStyle ? 'rgba(201, 138, 44, 0.06)' : 'transparent',
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
            color: isStyle ? '#7a4f10' : '#666',
            width: 10,
            display: 'inline-block',
          }}
        >
          {open ? '▾' : '▸'}
        </span>
        <strong
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            color: isStyle ? '#7a4f10' : '#444',
          }}
        >
          {props.title}
        </strong>
        {props.subtitle && (
          <span style={{ fontSize: 11, color: '#888' }}>{props.subtitle}</span>
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
      {props.label}
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
  { label: 'Calibri / Segoe UI', family: 'Calibri, "Segoe UI", sans-serif' },
  { label: 'Futura / Avenir', family: 'Futura, "Avenir Next", Avenir, sans-serif' },
  { label: 'Times / Serif', family: '"Times New Roman", Times, serif' },
  { label: 'Georgia', family: 'Georgia, serif' },
  { label: 'Garamond', family: 'Garamond, "Apple Garamond", serif' },
  { label: 'Didot / Bodoni', family: 'Didot, "Bodoni MT", serif' },
  { label: 'Courier (mono)', family: '"Courier New", Courier, monospace' },
  { label: 'Consolas (mono)', family: 'Consolas, "Lucida Console", monospace' },
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
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 80, color: '#666' }}>Reference</span>
        <select
          value={props.family}
          onChange={(e) => props.onChange({ refFontFamily: e.target.value })}
          style={{ flex: 1, fontSize: 12 }}
        >
          <option value="">— none —</option>
          {REF_FONTS.map((f) => (
            <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
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
      <span style={{ color: '#666', width: 80, flexShrink: 0 }}>{props.label}</span>
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

function StrokeOverlay(props: {
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
    (selection.kind === 'anchor' && selection.strokeIdx === strokeIdx);

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

  // Per-vertex default normal handle position (perp(tangent) × bare default
  // half-width at that anchor's arc-length parameter). When a vertex has a
  // normalOverride, the handle sits at p + override; otherwise at the
  // default. Pure function of (segs, profile) — no React state.
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
        stroke={isStrokeSelected ? '#1d6fe6' : '#888'}
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
                  stroke="#1d6fe6"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={inAbs.x}
                  cy={inAbs.y}
                  r={HANDLE}
                  fill="#fff"
                  stroke="#1d6fe6"
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
                  stroke="#1d6fe6"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={outAbs.x}
                  cy={outAbs.y}
                  r={HANDLE}
                  fill="#fff"
                  stroke="#1d6fe6"
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
              fill={sel ? '#1d6fe6' : '#fff'}
              stroke={sel ? '#1d6fe6' : '#222'}
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
 * affine `transformGlyph` step happen at the GLYPH level — see
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
  } else {
    polygon = outlineStroke(stroke, style, widthMod);
    if (evenness > 0 && polygon.length >= 3) {
      polygon = redistributePolygonEvenly(polygon, evenness);
    }
    triangles = triangulatePolygon(polygon);
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
