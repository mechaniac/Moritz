/**
 * Pure operations on glyphs / strokes / vertices. No mutation; every function
 * returns a new object. The state layer composes these to update `Font.glyphs`.
 */

import { vertexPairToSegment, pointAt } from './bezier.js';
import type { Glyph, Stroke, Vec2, Vertex } from './types.js';

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const ZERO: Vec2 = { x: 0, y: 0 };

let idCounter = 0;
export const newStrokeId = (): string =>
  `s_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;

// ---------- vertex / stroke replacement helpers -----------------------------

function replaceStroke(g: Glyph, strokeIdx: number, next: Stroke): Glyph {
  const strokes = g.strokes.slice();
  strokes[strokeIdx] = next;
  return { ...g, strokes };
}

function replaceVertex(s: Stroke, vIdx: number, next: Vertex): Stroke {
  const vertices = s.vertices.slice();
  vertices[vIdx] = next;
  return { ...s, vertices };
}

// ---------- public ops ------------------------------------------------------

export function moveAnchor(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  newP: Vec2,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, { ...v, p: newP }));
}

/** Move one handle in absolute coords. The stored handle is relative to `p`. */
export function moveHandle(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  side: 'in' | 'out',
  absoluteHandlePos: Vec2,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  const rel = sub(absoluteHandlePos, v.p);
  const next: Vertex =
    side === 'in' ? { ...v, inHandle: rel } : { ...v, outHandle: rel };
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, next));
}

export function deleteAnchor(g: Glyph, strokeIdx: number, vIdx: number): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  // A stroke must keep >=2 vertices; if removing would break that, drop the stroke.
  if (s.vertices.length <= 2) return deleteStroke(g, strokeIdx);
  const vertices = s.vertices.filter((_, i) => i !== vIdx);
  return replaceStroke(g, strokeIdx, { ...s, vertices });
}

export function deleteStroke(g: Glyph, strokeIdx: number): Glyph {
  return { ...g, strokes: g.strokes.filter((_, i) => i !== strokeIdx) };
}

/** Insert a corner anchor by splitting segment `segIdx` at `t`. */
export function insertAnchor(
  g: Glyph,
  strokeIdx: number,
  segIdx: number,
  t: number,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const a = s.vertices[segIdx];
  const b = s.vertices[segIdx + 1];
  if (!a || !b) return g;
  const seg = vertexPairToSegment(a, b);
  const p = pointAt(seg, t);
  const inserted: Vertex = { p, inHandle: ZERO, outHandle: ZERO };
  const vertices = [
    ...s.vertices.slice(0, segIdx + 1),
    inserted,
    ...s.vertices.slice(segIdx + 1),
  ];
  return replaceStroke(g, strokeIdx, { ...s, vertices });
}

/** Append a brand-new straight stroke across the middle of the glyph box. */
export function addStroke(g: Glyph): Glyph {
  const s: Stroke = {
    id: newStrokeId(),
    vertices: [
      { p: { x: g.box.w * 0.25, y: g.box.h * 0.5 }, inHandle: ZERO, outHandle: ZERO },
      { p: { x: g.box.w * 0.75, y: g.box.h * 0.5 }, inHandle: ZERO, outHandle: ZERO },
    ],
  };
  return { ...g, strokes: [...g.strokes, s] };
}

/** Symmetric handle drag: when one handle moves, mirror the other. */
export function setSymmetricHandle(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  side: 'in' | 'out',
  absoluteHandlePos: Vec2,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  const rel = sub(absoluteHandlePos, v.p);
  const opposite: Vec2 = { x: -rel.x, y: -rel.y };
  const next: Vertex =
    side === 'in'
      ? { ...v, inHandle: rel, outHandle: opposite }
      : { ...v, outHandle: rel, inHandle: opposite };
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, next));
}

/**
 * Reset both handles to zero (turns a smooth point back into a corner).
 */
export function makeCorner(g: Glyph, strokeIdx: number, vIdx: number): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  return replaceStroke(
    g,
    strokeIdx,
    replaceVertex(s, vIdx, { ...v, inHandle: ZERO, outHandle: ZERO }),
  );
}

/**
 * Initialize symmetric handles aligned with the chord between neighboring
 * anchors, sized to ~1/3 of the chord. For endpoints, fall back to the
 * direction toward the single neighbor. Used to "smooth" a corner.
 */
export function makeSmooth(g: Glyph, strokeIdx: number, vIdx: number): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  const prev = s.vertices[vIdx - 1];
  const next = s.vertices[vIdx + 1];
  let dir: Vec2;
  let size: number;
  if (prev && next) {
    dir = { x: next.p.x - prev.p.x, y: next.p.y - prev.p.y };
    size =
      Math.hypot(next.p.x - prev.p.x, next.p.y - prev.p.y) / 6;
  } else if (next) {
    dir = sub(next.p, v.p);
    size = Math.hypot(dir.x, dir.y) / 3;
  } else if (prev) {
    dir = sub(v.p, prev.p);
    size = Math.hypot(dir.x, dir.y) / 3;
  } else {
    return g;
  }
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  const out: Vec2 = { x: u.x * size, y: u.y * size };
  const inH: Vec2 = { x: -u.x * size, y: -u.y * size };
  return replaceStroke(
    g,
    strokeIdx,
    replaceVertex(s, vIdx, { ...v, inHandle: inH, outHandle: out }),
  );
}

// Re-export helpers used by callers
export { add as _add, sub as _sub, ZERO as _ZERO };

/**
 * Set the corner-join style at an anchor (only meaningful for hard-corner
 * anchors with non-collinear in/out handles). Pass `undefined` to clear.
 */
export function setCorner(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  corner: 'miter' | 'bevel' | undefined,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  const next = corner === undefined
    ? (() => {
        const { corner: _drop, ...rest } = v;
        return rest;
      })()
    : { ...v, corner };
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, next));
}
