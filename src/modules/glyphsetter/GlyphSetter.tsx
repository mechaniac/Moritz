/**
 * SVG-based glyph editor: thumbnails of all glyphs on the left,
 * editable canvas on the right with anchors and tangent handles.
 *
 * Pure mutations come from `core/glyphOps.ts`; this file only handles
 * pointer events and rendering.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { outlineStroke } from '../../core/stroke.js';
import { strokeToSegments } from '../../core/bezier.js';
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
import type { Font, Glyph, Stroke, Vec2 } from '../../core/types.js';
import { useAppStore } from '../../state/store.js';

const PADDING = 20;

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

  const glyph = font.glyphs[selectedChar];

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <GlyphGrid
        chars={Object.keys(font.glyphs)}
        selected={selectedChar}
        onSelect={selectGlyph}
        font={font}
      />
      <div
        style={{
          flex: 1,
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {glyph ? (
          <GlyphEditor
            char={selectedChar}
            glyph={glyph}
            onChange={updateSelectedGlyph}
            view={view}
            setView={setGlyphView}
          />
        ) : (
          <p>No glyph selected.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Sidebar ---------------------------------------------------------

function GlyphGrid(props: {
  chars: string[];
  selected: string;
  onSelect: (c: string) => void;
  font: Font;
}): JSX.Element {
  // Uniform thumbnail viewport across all glyphs so relative sizes are visible.
  const refBox = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const c of props.chars) {
      const g = props.font.glyphs[c];
      if (!g) continue;
      if (g.box.w > w) w = g.box.w;
      if (g.box.h > h) h = g.box.h;
    }
    return { w: w || 100, h: h || 140 };
  }, [props.chars, props.font]);

  return (
    <aside
      style={{
        width: 260,
        borderRight: '1px solid #ddd',
        padding: 8,
        overflowY: 'auto',
        background: '#fafafa',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {props.chars.map((c) => {
          const g = props.font.glyphs[c]!;
          const active = c === props.selected;
          return (
            <button
              key={c}
              onClick={() => props.onSelect(c)}
              title={c}
              style={{
                aspectRatio: `${refBox.w} / ${refBox.h}`,
                background: active ? '#222' : '#fff',
                color: active ? '#fff' : '#222',
                border: '1px solid #ccc',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <ThumbSvg glyph={g} font={props.font} refBox={refBox} />
              <div style={{ fontSize: 10, marginTop: 2 }}>{c}</div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ThumbSvg(props: {
  glyph: Glyph;
  font: Font;
  refBox: { w: number; h: number };
}): JSX.Element {
  const { glyph, font, refBox } = props;
  const paths = useMemo(
    () => glyph.strokes.map((s) => polygonD(outlineStroke(s, font.style))),
    [glyph, font.style],
  );
  // Center this glyph within the shared reference box so relative sizes show.
  const dx = (refBox.w - glyph.box.w) / 2;
  const dy = (refBox.h - glyph.box.h) / 2;
  return (
    <svg
      viewBox={`0 0 ${refBox.w} ${refBox.h}`}
      style={{ flex: 1, width: '100%', height: 'auto', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`translate(${dx} ${dy})`} fill="currentColor">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ---------- Editor ----------------------------------------------------------

function GlyphEditor(props: {
  char: string;
  glyph: Glyph;
  onChange: (fn: (g: Glyph) => Glyph) => void;
  view: import('../../state/store.js').GlyphViewOptions;
  setView: (
    patch: Partial<import('../../state/store.js').GlyphViewOptions>,
  ) => void;
}): JSX.Element {
  const { char, glyph, onChange, view, setView } = props;
  const font = useAppStore((s) => s.font);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [scale, setScale] = useState<number>(5);
  const SCALE = scale;
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const viewW = glyph.box.w * SCALE + PADDING * 2;
  const viewH = glyph.box.h * SCALE + PADDING * 2;

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
        x: (local.x - PADDING) / SCALE,
        y: (local.y - PADDING) / SCALE,
      };
    },
    [SCALE],
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Editing: {char}</h2>
        <button onClick={onAddStroke}>+ Stroke</button>
        <button
          onClick={onDeleteSelected}
          disabled={selection.kind === 'none'}
        >
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
        <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={view.showFillPreview}
            onChange={(e) => setView({ showFillPreview: e.target.checked })}
          />
          Fill preview
        </label>
        <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={view.showAnchors}
            onChange={(e) => setView({ showAnchors: e.target.checked })}
          />
          Anchors
        </label>
        <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={view.showBorders}
            onChange={(e) => setView({ showBorders: e.target.checked })}
          />
          Debug borders
        </label>
        {selection.kind === 'anchor' && (() => {
          const v = glyph.strokes[selection.strokeIdx]?.vertices[selection.vIdx];
          if (!v) return null;
          return (
            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={v.breakTangent === true}
                onChange={(e) =>
                  onChange((g) =>
                    setBreakTangent(g, selection.strokeIdx, selection.vIdx, e.target.checked),
                  )
                }
              />
              Break tangent
            </label>
          );
        })()}
        <span style={{ color: '#666', fontSize: 12, marginLeft: 'auto' }}>
          Drag anchors / handles. Alt-click stroke = insert anchor. Alt-click
          anchor = toggle corner/smooth.
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: 6 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        width={viewW}
        height={viewH}
        style={{ display: 'block', touchAction: 'none' }}
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
          fill="transparent"
          onPointerDown={() => setSelection({ kind: 'none' })}
        />
        {/* glyph box */}
        <rect
          x={PADDING}
          y={PADDING}
          width={glyph.box.w * SCALE}
          height={glyph.box.h * SCALE}
          fill="none"
          stroke="#eee"
          pointerEvents="none"
        />
        {/* outlined preview (faded) */}
        {view.showFillPreview && (
          <g
            transform={`translate(${PADDING} ${PADDING}) scale(${SCALE})`}
            fill="rgba(0,0,0,0.15)"
            pointerEvents="none"
          >
            {glyph.strokes.map((s, i) => (
              <path key={`o${i}`} d={polygonD(outlineStroke(s, font.style))} />
            ))}
          </g>
        )}
        {/* debug border overlay */}
        {view.showBorders && (
          <g
            transform={`translate(${PADDING} ${PADDING}) scale(${SCALE})`}
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
              // Single source of truth: the outline path drawn here is the
              // EXACT same closed polygon `outlineStroke` returns to the
              // renderer, so debug overlay and rendered shape can never
              // disagree.
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
        {/* control geometry */}
        <g transform={`translate(${PADDING} ${PADDING}) scale(${SCALE})`}>
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

function polygonD(points: readonly Vec2[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  return d + ' Z';
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
