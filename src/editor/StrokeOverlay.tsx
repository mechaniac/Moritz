import { useMemo } from 'react';
import { strokeToSegments, tangentAt } from '../core/bezier.js';
import { widthAt } from '../core/stroke.js';
import type { Stroke, Vec2, WidthProfile } from '../core/types.js';

export type Selection =
  | { kind: 'none' }
  | { kind: 'stroke'; strokeIdx: number }
  | { kind: 'anchor'; strokeIdx: number; vIdx: number }
  | { kind: 'multi'; strokeIdxs: readonly number[] };

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
    const parts: string[] = [`M ${segs[0]!.p0.x} ${segs[0]!.p0.y}`];
    for (const seg of segs) {
      parts.push(
        `C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.p1.x} ${seg.p1.y}`,
      );
    }
    return parts.join(' ');
  }, [segs]);

  const ANCHOR = 8 / scale;
  const HANDLE = 6 / scale;
  const HAIR = 2 / scale;

  const normalHandles = useMemo<readonly Vec2[]>(() => {
    if (segs.length === 0) {
      return stroke.vertices.map((v) => ({ x: v.p.x, y: v.p.y }));
    }
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
      const avg =
        k === 0
          ? tOut
          : k === segs.length
            ? tIn
            : { x: tIn.x + tOut.x, y: tIn.y + tOut.y };
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
      {showAnchors &&
        stroke.vertices.map((v, vIdx) => {
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
              {sel &&
                (() => {
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
                        strokeDasharray={
                          hasOverride ? undefined : `${HAIR * 1.5} ${HAIR * 1.5}`
                        }
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
