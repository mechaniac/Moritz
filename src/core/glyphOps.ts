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

/**
 * Move one handle in absolute coords. The stored handle is relative to `p`.
 *
 * When the anchor's `breakTangent` is false / undefined (smooth point), the
 * opposite handle is reflected across `p` to keep the tangents collinear,
 * PRESERVING its existing length (Illustrator-style smooth point). If the
 * opposite handle has zero length, it stays at zero — drag both manually
 * once you've broken the tangent.
 */
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
  let next: Vertex =
    side === 'in' ? { ...v, inHandle: rel } : { ...v, outHandle: rel };
  if (!v.breakTangent) {
    const opposite = side === 'in' ? v.outHandle : v.inHandle;
    const oppLen = Math.hypot(opposite.x, opposite.y);
    const dragLen = Math.hypot(rel.x, rel.y);
    if (oppLen > 1e-9 && dragLen > 1e-9) {
      const scale = oppLen / dragLen;
      const mirrored: Vec2 = { x: -rel.x * scale, y: -rel.y * scale };
      next = side === 'in'
        ? { ...next, outHandle: mirrored }
        : { ...next, inHandle: mirrored };
    }
  }
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, next));
}

/** Translate every vertex of a single stroke by `(dx, dy)`. Handles are
 *  relative to their anchor and so don't change. */
export function translateStroke(
  g: Glyph,
  strokeIdx: number,
  dx: number,
  dy: number,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  if (dx === 0 && dy === 0) return g;
  const next = {
    ...s,
    vertices: s.vertices.map((v) => ({
      ...v,
      p: { x: v.p.x + dx, y: v.p.y + dy },
    })),
  };
  return replaceStroke(g, strokeIdx, next);
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

/** Deep-immutable clone of a stroke with a fresh id. Used by copy/paste so
 *  the pasted stroke is independent of the source and never collides on id. */
export function cloneStroke(s: Stroke, offset: Vec2 = ZERO): Stroke {
  return {
    ...s,
    id: newStrokeId(),
    vertices: s.vertices.map((v) => ({
      p: { x: v.p.x + offset.x, y: v.p.y + offset.y },
      inHandle: { x: v.inHandle.x, y: v.inHandle.y },
      outHandle: { x: v.outHandle.x, y: v.outHandle.y },
      ...(v.breakTangent ? { breakTangent: true as const } : {}),
      ...(v.normalOverride
        ? { normalOverride: { x: v.normalOverride.x, y: v.normalOverride.y } }
        : {}),
    })),
  };
}

/** Append clones of `strokes` to `g`. Each clone gets a fresh id. */
export function pasteStrokes(
  g: Glyph,
  strokes: readonly Stroke[],
  offset: Vec2 = ZERO,
): Glyph {
  if (strokes.length === 0) return g;
  return {
    ...g,
    strokes: [...g.strokes, ...strokes.map((s) => cloneStroke(s, offset))],
  };
}

/** Mirror a stroke across an axis through `cx`/`cy`. Vertex positions are
 *  reflected around the axis; handles (regular displacement vectors) get
 *  the mirror's negated component. `normalOverride` is a *pseudo-vector*
 *  (a normal direction): under a 2D reflection its effective angle
 *  reflects across the mirror axis, which corresponds to negating the
 *  *other* component from the one we negate on the handles — otherwise
 *  the override's frame angle (relative to the new default normal)
 *  becomes the supplement of the original, and the renderer twists the
 *  ribbon along the segment. `breakTangent` and the stroke id are
 *  preserved. */
export function flipStrokeHorizontal(
  g: Glyph,
  strokeIdx: number,
  cx: number,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const next: Stroke = {
    ...s,
    vertices: s.vertices.map((v) => ({
      ...v,
      p: { x: 2 * cx - v.p.x, y: v.p.y },
      inHandle: { x: -v.inHandle.x, y: v.inHandle.y },
      outHandle: { x: -v.outHandle.x, y: v.outHandle.y },
      ...(v.normalOverride
        ? { normalOverride: { x: v.normalOverride.x, y: -v.normalOverride.y } }
        : {}),
    })),
  };
  return replaceStroke(g, strokeIdx, next);
}

export function flipStrokeVertical(
  g: Glyph,
  strokeIdx: number,
  cy: number,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const next: Stroke = {
    ...s,
    vertices: s.vertices.map((v) => ({
      ...v,
      p: { x: v.p.x, y: 2 * cy - v.p.y },
      inHandle: { x: v.inHandle.x, y: -v.inHandle.y },
      outHandle: { x: v.outHandle.x, y: -v.outHandle.y },
      ...(v.normalOverride
        ? { normalOverride: { x: -v.normalOverride.x, y: v.normalOverride.y } }
        : {}),
    })),
  };
  return replaceStroke(g, strokeIdx, next);
}

/** Conservative anchor-based bbox of a stroke: tight enough for marquee
 *  hit-testing, cheap to compute. Ignores handle protrusions (a Bézier may
 *  bow slightly outside the convex hull of its anchors), which keeps the
 *  test predictable for users dragging a tiny lasso around an anchor. */
export function strokeAnchorBBox(s: Stroke): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of s.vertices) {
    if (v.p.x < minX) minX = v.p.x;
    if (v.p.y < minY) minY = v.p.y;
    if (v.p.x > maxX) maxX = v.p.x;
    if (v.p.y > maxY) maxY = v.p.y;
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
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
 * Toggle / set whether the anchor's in & out tangents move independently.
 *
 * Setting `broken = false` (smooth) immediately re-aligns the handles so
 * they are collinear, using the BISECTOR of the two current tangent
 * directions (out direction = +outHandle, in's outgoing direction = -inHandle).
 * Each handle keeps its own length; only the directions snap. If one handle
 * is zero we mirror from the non-zero one. If both are zero, nothing to do.
 */
export function setBreakTangent(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  broken: boolean,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  let next: Vertex;
  if (broken) {
    next = { ...v, breakTangent: true };
  } else {
    const { breakTangent: _drop, ...rest } = v;
    next = rest;
    const outLen = Math.hypot(v.outHandle.x, v.outHandle.y);
    const inLen = Math.hypot(v.inHandle.x, v.inHandle.y);
    if (outLen > 1e-9 && inLen > 1e-9) {
      // Bisector of the two outgoing-tangent directions:
      // out's outgoing dir = +outHandle, in's outgoing dir = -inHandle.
      const oux = v.outHandle.x / outLen;
      const ouy = v.outHandle.y / outLen;
      const iux = -v.inHandle.x / inLen;
      const iuy = -v.inHandle.y / inLen;
      let bx = oux + iux;
      let by = ouy + iuy;
      let blen = Math.hypot(bx, by);
      if (blen < 1e-9) {
        // Tangents are exactly opposite (180°): bisector is undefined.
        // Pick a perpendicular fallback so we don't NaN out.
        bx = -ouy;
        by = oux;
        blen = 1;
      }
      const ux = bx / blen;
      const uy = by / blen;
      next = {
        ...next,
        outHandle: { x: ux * outLen, y: uy * outLen },
        inHandle: { x: -ux * inLen, y: -uy * inLen },
      };
    } else if (outLen > 1e-9) {
      const ux = v.outHandle.x / outLen;
      const uy = v.outHandle.y / outLen;
      next = { ...next, inHandle: { x: -ux * outLen, y: -uy * outLen } };
    } else if (inLen > 1e-9) {
      const ux = v.inHandle.x / inLen;
      const uy = v.inHandle.y / inLen;
      next = { ...next, outHandle: { x: -ux * inLen, y: -uy * inLen } };
    }
  }
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, next));
}

/**
 * Set the per-anchor normal override to the absolute glyph-space point
 * `absoluteHandlePos`. The stored override is the offset from `p`.
 * When `absoluteHandlePos` coincides with `p` (zero-length override),
 * the override is removed (auto behavior restored).
 */
export function setNormalOverride(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
  absoluteHandlePos: Vec2,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v) return g;
  const rel = sub(absoluteHandlePos, v.p);
  if (Math.hypot(rel.x, rel.y) < 1e-9) return clearNormalOverride(g, strokeIdx, vIdx);
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, { ...v, normalOverride: rel }));
}

/**
 * Remove any per-anchor normal override (returns to auto: tangent-perp
 * with width pulled from the active `WidthProfile`).
 */
export function clearNormalOverride(
  g: Glyph,
  strokeIdx: number,
  vIdx: number,
): Glyph {
  const s = g.strokes[strokeIdx];
  if (!s) return g;
  const v = s.vertices[vIdx];
  if (!v || v.normalOverride === undefined) return g;
  const { normalOverride: _drop, ...rest } = v;
  return replaceStroke(g, strokeIdx, replaceVertex(s, vIdx, rest as Vertex));
}
