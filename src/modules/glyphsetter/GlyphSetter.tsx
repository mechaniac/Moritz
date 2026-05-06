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
 *                                             (live-edits font.style — also
 *                                             editable in StyleSetter), and
 *                                             guides.
 *
 * Anchor positions and tangent handles are the ONLY per-glyph editable data
 * here. Everything else (caps, triangulation, ribbon density, etc.) lives in
 * `font.style` and is shared with StyleSetter.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { outlineStroke } from '../../core/stroke.js';
import { strokeToSegments } from '../../core/bezier.js';
import { triangulatePolygon } from '../../core/triangulate.js';
import { triangulateStrokeRibbon } from '../../core/ribbon.js';
import { layout as layoutText } from '../../core/layout.js';
import type { GlyphViewOptions } from '../../state/store.js';
import { computeLayerGeometry } from './guides.js';
import { GuidesPanel } from './GuidesPanel.js';
import { measureFontMetrics, measureGlyphMetrics } from './fontMetrics.js';
import {
  addStroke,
  deleteAnchor,
  deleteStroke,
  insertAnchor,
  makeCorner,
  makeSmooth,
  moveAnchor,
  moveHandle,
  setBreakTangent,
} from '../../core/glyphOps.js';
import type {
  CapShape,
  Font,
  Glyph,
  Stroke,
  StyleSettings,
  TriMode,
  Vec2,
} from '../../core/types.js';
import { useAppStore } from '../../state/store.js';

const PADDING = 20;

// Reference frame inside the glyph editor — a fixed square the user can
// always see, so adjustments to a glyph's own box read as deviations from
// this default. Picked to match defaultFont's BOX_H (140) so most glyphs
// fit naturally inside it.
const DEFAULT_BOX = 140;

// Fixed widths for the outer columns. Center canvas takes the rest.
const GRID_W = 360;
const INSPECTOR_W = 300;

type Selection =
  | { kind: 'none' }
  | { kind: 'stroke'; strokeIdx: number }
  | { kind: 'anchor'; strokeIdx: number; vIdx: number };

type Drag =
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'handle'; strokeIdx: number; vIdx: number; side: 'in' | 'out' };

export function GlyphSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const selectedChar = useAppStore((s) => s.selectedGlyph);
  const selectGlyph = useAppStore((s) => s.selectGlyph);
  const updateSelectedGlyph = useAppStore((s) => s.updateSelectedGlyph);
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
  const paths = useMemo(
    () =>
      glyph.strokes.map((s) => {
        const { polygon, triangles } = triangulateForStyle(s, font.style);
        return trianglesD(polygon, triangles);
      }),
    [glyph, font.style],
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
  const [scale, setScale] = useState<number>(5);
  const SCALE = scale;
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
    } else {
      onChange((g) => moveHandle(g, drag.strokeIdx, drag.vIdx, drag.side, p));
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

  // Alt-click on a stroke path inserts an anchor at the closest segment midpoint.
  const onStrokeClick = (e: React.MouseEvent, strokeIdx: number) => {
    e.stopPropagation();
    if (e.altKey) {
      const p = toGlyph(e.clientX, e.clientY);
      if (!p) return;
      const stroke = glyph.strokes[strokeIdx];
      if (!stroke) return;
      const segIdx = nearestSegmentIndex(stroke, p);
      onChange((g) => insertAnchor(g, strokeIdx, segIdx, 0.5));
    } else {
      setSelection({ kind: 'stroke', strokeIdx });
    }
  };

  const selectedAnchor =
    selection.kind === 'anchor'
      ? glyph.strokes[selection.strokeIdx]?.vertices[selection.vIdx]
      : undefined;

  return (
    <>
      {/* Toolbar: glyph-editing actions only (anchors/strokes are the per-
          glyph data). Style/preview controls live in the Inspector panel. */}
      <div
        className="mz-glyphsetter__toolbar"
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          borderBottom: '1px solid #999',
          background: '#eaeaea',
          flexShrink: 0,
          overflow: 'hidden',
          fontSize: 13,
        }}
      >
        <strong style={{ fontSize: 14 }}>Editing: {char}</strong>
        <button onClick={onAddStroke}>+ Stroke</button>
        <button onClick={onDeleteSelected} disabled={selection.kind === 'none'}>
          − Delete selected
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#666', fontSize: 12 }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            style={{ width: 100 }}
          />
        </span>
        {selectedAnchor && selection.kind === 'anchor' && (
          <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={selectedAnchor.breakTangent === true}
              onChange={(e) =>
                onChange((g) =>
                  setBreakTangent(g, selection.strokeIdx, selection.vIdx, e.target.checked),
                )
              }
            />
            Break tangent
          </label>
        )}
        <span style={{ color: '#666', fontSize: 12, marginLeft: 'auto' }}>
          Drag anchors / handles. Alt-click stroke = insert anchor. Alt-click
          anchor = toggle corner/smooth.
        </span>
      </div>
      {/* Canvas — fills remaining space */}
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
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
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
                  stroke="#0a84ff"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <line
                  x1={xRight}
                  x2={xRight}
                  y1={y0}
                  y2={y1}
                  stroke="#0a84ff"
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
                return (
                  <g key={`other-${c}`} opacity={0.05}>
                    {g.strokes.map((s, i) => {
                      const { polygon, triangles } = triangulateForStyle(s, font.style);
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
              {glyph.strokes.map((s, i) => {
                const { polygon, triangles } = triangulateForStyle(s, font.style);
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
              {glyph.strokes.map((s, i) => {
                const poly = outlineStroke(s, font.style);
                const sw = 1.4 / SCALE;
                const dotR = 2.6 / SCALE;
                const fontPx = 9 / SCALE;
                const closed = poly.length > 0 ? [...poly, poly[0]!] : [];
                return (
                  <g key={`b${i}`}>
                    <path d={polylineD(closed)} stroke="#0a84ff" strokeWidth={sw} />
                    {poly.map((p, k) => (
                      <g key={`v${i}-${k}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={dotR}
                          fill="#111"
                          stroke="#fff"
                          strokeWidth={sw * 0.6}
                        />
                        <text
                          x={p.x + dotR * 1.4}
                          y={p.y - dotR * 1.4}
                          fontSize={fontPx}
                          fill="#111"
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
              {glyph.strokes.map((s, i) => {
                const { polygon, triangles } = triangulateForStyle(s, font.style);
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
          {/* control geometry */}
          <g transform={xform}>
            {glyph.strokes.map((s, sIdx) => (
              <StrokeOverlay
                key={s.id}
                stroke={s}
                strokeIdx={sIdx}
                selection={selection}
                showAnchors={view.showAnchors}
                scale={SCALE}
                onStrokeClick={onStrokeClick}
                onAnchorPointerDown={startAnchorDrag}
                onHandlePointerDown={startHandleDrag}
              />
            ))}
          </g>
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
}): JSX.Element {
  const { view, setView, style, setStyle, glyph, updateGlyph } = props;
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
        <RefFontPicker
          family={view.refFontFamily}
          opacity={view.refFontOpacity}
          onChange={setView}
        />
      </Section>
      {glyph && (
        <Section title="Glyph" tone="local" subtitle="Per-glyph metrics">
          <button
            type="button"
            disabled={!view.refFontFamily}
            onClick={() => {
              if (!view.refFontFamily) return;
              const fm = measureFontMetrics(view.refFontFamily);
              const gm = measureGlyphMetrics(view.refFontFamily, glyph.char);
              if (!gm) return;
              // Same vertical scale as 'Align to reference font':
              // 1em maps to box.h / (ascent + descent) font units.
              updateGlyph((g) => {
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
              });
            }}
            title={
              view.refFontFamily
                ? "Set this glyph's box width and side bearings from the reference font's measured advance width and ink bounds. Vertical scale matches 'Align to reference font'."
                : 'Pick a Reference font in the View section first.'
            }
            style={{ fontSize: 11, padding: '2px 6px', marginBottom: 4 }}
          >
            Import metrics from reference font
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
        </Section>
      )}
      <Section
        title="Preview style"
        tone="style"
        subtitle="Shared with StyleSetter"
      >
        <Row label="Algorithm" tooltip="Triangulation algorithm. earcut: minimal triangle count from the outline polygon. ribbon-fixed: quad strip with N samples per Bezier segment. ribbon-density: quad strip with subdivision driven by spacing in glyph units.">
          <select
            value={style.triMode ?? 'earcut'}
            onChange={(e) => setStyle({ triMode: e.target.value as TriMode })}
            style={{ fontSize: 12, flex: 1 }}
          >
            <option value="earcut">earcut (minimal)</option>
            <option value="ribbon-fixed">ribbon (fixed N)</option>
            <option value="ribbon-density">ribbon (density)</option>
          </select>
        </Row>
        {style.triMode === 'ribbon-fixed' && (
          <NumSlider
            label="samples / seg"
            min={0}
            max={64}
            step={1}
            value={style.ribbonSamples ?? 6}
            onChange={(v) => setStyle({ ribbonSamples: Math.round(v) })}
            format={(v) => v.toFixed(0)}
            tooltip="Number of interior samples per Bezier segment. Higher = smoother quad strip but more triangles."
          />
        )}
        {style.triMode === 'ribbon-density' && (
          <NumSlider
            label="density"
            min={0.05}
            max={4}
            step={0.05}
            value={1 / Math.max(0.0001, style.ribbonSpacing ?? 4)}
            onChange={(v) => setStyle({ ribbonSpacing: 1 / Math.max(0.05, v) })}
            format={(v) => v.toFixed(2)}
            tooltip="Sample density in 1/(glyph units). Higher places samples closer together along the path arc length."
          />
        )}
        {(style.triMode === 'ribbon-fixed' || style.triMode === 'ribbon-density') && (
          <>
            <NumSlider
              label="spread"
              min={0}
              max={1}
              step={0.05}
              value={style.ribbonSpread ?? 1}
              onChange={(v) => setStyle({ ribbonSpread: v })}
              tooltip="0 = parameter-uniform sample placement (cheap, can clump). 1 = arc-length-uniform (even spacing along curve length)."
            />
            <NumSlider
              label="anchor pull"
              min={0}
              max={1}
              step={0.05}
              value={style.ribbonAnchorPull ?? 0}
              onChange={(v) => setStyle({ ribbonAnchorPull: v })}
              tooltip="Bias samples toward anchor points with active tangents (helps preserve sharp turns)."
            />
          </>
        )}
        <Row label="Cap start" tooltip="Cap shape at the first vertex of every stroke. Per-stroke overrides take precedence.">
          <CapSelect
            value={normalizeSimpleCap(style.capStart)}
            onChange={(v) => setStyle({ capStart: v })}
          />
        </Row>
        <Row label="Cap end" tooltip="Cap shape at the last vertex of every stroke.">
          <CapSelect
            value={normalizeSimpleCap(style.capEnd)}
            onChange={(v) => setStyle({ capEnd: v })}
          />
        </Row>
        <NumSlider
          label="cap bulge"
          min={0}
          max={2}
          step={0.05}
          value={style.capRoundBulge ?? 1}
          onChange={(v) => setStyle({ capRoundBulge: v })}
          tooltip="Roundness of round caps. 0 = flat. 1 = true semicircle. >1 pushes the cap further past the endpoint for a bulbous look."
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
          borderBottom: active ? '2px solid #0a84ff' : '2px solid transparent',
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
}): JSX.Element {
  const { font, pairs, onChange } = props;
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

  return (
    <div
      className="mz-kerning-list"
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        padding: 8,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
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
      paths: glyph.strokes.map((s) => {
        const { polygon, triangles } = triangulateForStyle(s, font.style);
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
}): JSX.Element {
  const isStyle = props.tone === 'style';
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
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
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
      {props.children}
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

function Row(props: {
  label: string;
  children: React.ReactNode;
  tooltip?: string;
}): JSX.Element {
  return (
    <div
      title={props.tooltip}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
      }}
    >
      <span style={{ color: '#666', width: 80, flexShrink: 0 }}>{props.label}</span>
      {props.children}
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
      <span style={{ width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(props.value)}
      </span>
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
  onStrokeClick: (e: React.MouseEvent, strokeIdx: number) => void;
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
}): JSX.Element {
  const { stroke, strokeIdx, selection, showAnchors, scale } = props;
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

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={isStrokeSelected ? '#0a84ff' : '#888'}
        strokeWidth={HAIR}
        onClick={(e) => props.onStrokeClick(e, strokeIdx)}
        style={{ cursor: 'pointer' }}
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
                  stroke="#0a84ff"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={inAbs.x}
                  cy={inAbs.y}
                  r={HANDLE}
                  fill="#fff"
                  stroke="#0a84ff"
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
                  stroke="#0a84ff"
                  strokeWidth={HAIR / 2}
                />
                <circle
                  cx={outAbs.x}
                  cy={outAbs.y}
                  r={HANDLE}
                  fill="#fff"
                  stroke="#0a84ff"
                  strokeWidth={HAIR / 2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) =>
                    props.onHandlePointerDown(e, strokeIdx, vIdx, 'out')
                  }
                />
              </>
            )}
            <rect
              x={v.p.x - ANCHOR / 2}
              y={v.p.y - ANCHOR / 2}
              width={ANCHOR}
              height={ANCHOR}
              fill={sel ? '#0a84ff' : '#fff'}
              stroke="#0a84ff"
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

type SimpleCap = 'round' | 'flat' | 'tapered';
function normalizeSimpleCap(c: CapShape): SimpleCap {
  return c === 'round' || c === 'flat' || c === 'tapered' ? c : 'round';
}

function CapSelect(props: {
  value: SimpleCap;
  onChange: (v: SimpleCap) => void;
}): JSX.Element {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as SimpleCap)}
      style={{ fontSize: 12, flex: 1 }}
    >
      <option value="round">round</option>
      <option value="flat">flat</option>
      <option value="tapered">tapered</option>
    </select>
  );
}

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
 */
function triangulateForStyle(
  stroke: Stroke,
  style: StyleSettings,
): { polygon: readonly Vec2[]; triangles: readonly (readonly [number, number, number])[] } {
  const mode = style.triMode ?? 'earcut';
  if (mode === 'ribbon-fixed') {
    return triangulateStrokeRibbon(stroke, style, {
      kind: 'fixed',
      samplesPerSegment: style.ribbonSamples ?? 6,
      spread: style.ribbonSpread ?? 1,
      anchorPull: style.ribbonAnchorPull ?? 0,
    });
  }
  if (mode === 'ribbon-density') {
    return triangulateStrokeRibbon(stroke, style, {
      kind: 'density',
      spacing: style.ribbonSpacing ?? 4,
      spread: style.ribbonSpread ?? 1,
      anchorPull: style.ribbonAnchorPull ?? 0,
    });
  }
  const poly = outlineStroke(stroke, style);
  return { polygon: poly, triangles: triangulatePolygon(poly) };
}

function polylineD(points: readonly Vec2[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  return d;
}

function nearestSegmentIndex(stroke: Stroke, p: Vec2): number {
  // Cheap heuristic: pick the segment whose midpoint is closest to p.
  // Good enough for inserting an anchor on alt-click.
  const segs = strokeToSegments(stroke);
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const mx = (seg.p0.x + seg.p1.x) / 2;
    const my = (seg.p0.y + seg.p1.y) / 2;
    const d = (mx - p.x) ** 2 + (my - p.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}
