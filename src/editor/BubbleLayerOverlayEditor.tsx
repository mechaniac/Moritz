import { useMemo, useRef } from 'react';
import { effectiveStyleForGlyph } from '../core/stroke.js';
import { transformStroke, type Affine } from '../core/transform.js';
import {
  clearNormalOverride,
  moveAnchor,
  moveHandle,
  setNormalOverride,
  translateStroke,
} from '../core/glyphOps.js';
import type {
  Bubble,
  BubbleLayer,
  Glyph,
  StyleSettings,
  Vec2,
  WidthProfile,
} from '../core/types.js';
import { StrokeOverlay, type Selection } from './StrokeOverlay.js';

type Drag =
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'handle'; strokeIdx: number; vIdx: number; side: 'in' | 'out' }
  | { kind: 'normal'; strokeIdx: number; vIdx: number }
  | { kind: 'stroke'; strokeIdx: number; lastX: number; lastY: number };

export type BubbleLayerOverlayEditorProps = {
  readonly bubble: Bubble;
  readonly bubbleStyle: StyleSettings;
  readonly layerId: string;
  readonly targetW: number;
  readonly targetH: number;
  readonly inner: { offsetX: number; offsetY: number; width: number; height: number };
  readonly zoom: number;
  readonly selection: Selection;
  readonly setSelection: (s: Selection) => void;
  readonly updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
};

/**
 * Page-space overlay editor for one bubble layer.
 *
 * This is the first shared "shape editor" extraction: TypeSetter can edit
 * a placed bubble layer without owning the anchor/handle drag plumbing.
 * The component is intentionally target-agnostic apart from the Bubble
 * placement transform, so the same path can be promoted into a fuller base
 * editor later.
 */
export function BubbleLayerOverlayEditor(
  props: BubbleLayerOverlayEditorProps,
): JSX.Element | null {
  const {
    bubble,
    bubbleStyle,
    layerId,
    targetW,
    targetH,
    inner,
    zoom,
    selection,
    setSelection,
    updateLayer,
  } = props;
  const layer = bubble.layers.find((l) => l.id === layerId);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  if (!layer) return null;

  const sx = bubble.box.w > 0 ? targetW / bubble.box.w : 1;
  const sy = bubble.box.h > 0 ? targetH / bubble.box.h : 1;
  const ax = bubble.box.w * layer.anchorX;
  const ay = bubble.box.h * layer.anchorY;
  const txSrc = ax + layer.offsetX - (layer.glyph.box.w * layer.scale) / 2;
  const tySrc = ay + layer.offsetY - (layer.glyph.box.h * layer.scale) / 2;
  const tx = txSrc * sx;
  const ty = tySrc * sy;
  const s = layer.scale;

  const deformedGlyph = useMemo<Glyph>(() => {
    if (sx === 1 && sy === 1) return layer.glyph;
    const m: Affine = { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
    return {
      ...layer.glyph,
      strokes: layer.glyph.strokes.map((stk) => transformStroke(m, stk)),
    };
  }, [layer.glyph, sx, sy]);

  const gStyle = useMemo(
    () => effectiveStyleForGlyph(bubbleStyle, deformedGlyph),
    [bubbleStyle, deformedGlyph],
  );
  const defaultProfile: WidthProfile = gStyle.defaultWidth;

  const toSourceGlyph = (clientX: number, clientY: number): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(inv);
    if (s === 0 || sx === 0 || sy === 0) return null;
    const xDef = (local.x - tx) / s;
    const yDef = (local.y - ty) / s;
    return { x: xDef / sx, y: yDef / sy };
  };

  const onAnchorPointerDown = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'anchor', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onHandlePointerDown = (
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

  const onStrokePointerDown = (e: React.PointerEvent, strokeIdx: number) => {
    e.stopPropagation();
    setSelection({ kind: 'stroke', strokeIdx });
    const p = toSourceGlyph(e.clientX, e.clientY);
    if (!p) return;
    dragRef.current = { kind: 'stroke', strokeIdx, lastX: p.x, lastY: p.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onNormalPointerDown = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    if (e.shiftKey) {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: clearNormalOverride(l.glyph, strokeIdx, vIdx),
      }));
      setSelection({ kind: 'anchor', strokeIdx, vIdx });
      return;
    }
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'normal', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSourceGlyph(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'anchor') {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: moveAnchor(l.glyph, drag.strokeIdx, drag.vIdx, p),
      }));
    } else if (drag.kind === 'handle') {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: moveHandle(l.glyph, drag.strokeIdx, drag.vIdx, drag.side, p),
      }));
    } else if (drag.kind === 'stroke') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = p.x;
      drag.lastY = p.y;
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: translateStroke(l.glyph, drag.strokeIdx, dx, dy),
      }));
    } else {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: setNormalOverride(l.glyph, drag.strokeIdx, drag.vIdx, p),
      }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const screenScale = zoom * s;
  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`${inner.offsetX} ${inner.offsetY} ${inner.width} ${inner.height}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <g transform={`translate(${tx} ${ty}) scale(${s})`} pointerEvents="auto">
        {deformedGlyph.strokes.map((stk, i) => (
          <StrokeOverlay
            key={stk.id}
            stroke={stk}
            strokeIdx={i}
            selection={selection}
            showAnchors
            scale={screenScale}
            profile={stk.width ?? defaultProfile}
            onStrokePointerDown={onStrokePointerDown}
            onAnchorPointerDown={onAnchorPointerDown}
            onHandlePointerDown={onHandlePointerDown}
            onNormalPointerDown={onNormalPointerDown}
          />
        ))}
      </g>
    </svg>
  );
}
