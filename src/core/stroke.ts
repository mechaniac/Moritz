/**
 * Variable-width stroke outlining.
 *
 * Pipeline per stroke:
 *   1. Build cubic segments from vertices.
 *   2. For each segment independently, sample it (including BOTH endpoints
 *      with their own tangent) and emit two offset polylines (left, right).
 *   3. Stitch consecutive segments' offset polylines at interior junctions
 *      with a miter join — i.e. intersect the two offset lines so corners
 *      meet at a single point on each side instead of overlapping. If the
 *      miter would be excessively long (very sharp angle), fall back to a
 *      bevel (keep both offset points).
 *   4. Concatenate left forward, end cap, right reversed, start cap into a
 *      single closed polygon.
 *
 * Output: a single closed polygon as a flat array of Vec2. The first and last
 * point are NOT identical; the renderer should close the path.
 */

import {
  pointAt,
  strokeToSegments,
  tangentAt,
  type CubicSegment,
} from './bezier.js';
import type {
  CapShape,
  Stroke,
  StyleSettings,
  Vec2,
  WidthProfile,
} from './types.js';

/**
 * Resolved world-orientation context for the renderer.
 *   - `normal`: the unit vector the nib lays its width along.
 *   - `blend` : in (0, 1]. 1 = pure world (constant nib direction);
 *               <1 = mixed with the path's tangent-perpendicular normal.
 * Returns `null` when the effect is fully off (pure tangent normals).
 */
export type WorldWidth = { readonly normal: Vec2; readonly blend: number };

export function resolveWorldWidth(style: StyleSettings): WorldWidth | null {
  const blend =
    style.worldBlend ?? (style.widthOrientation === 'world' ? 1 : 0);
  if (!(blend > 0)) return null;
  const a = style.worldAngle;
  return {
    normal: { x: -Math.sin(a), y: Math.cos(a) },
    blend: Math.min(1, blend),
  };
}

/**
 * Pick the unit normal at a path sample. With no world component we use the
 * tangent-perpendicular (rotate tangent 90° CCW). With a world component we
 * linearly interpolate the two unit normals and renormalize — this is the
 * "nib that still tracks the curve" look at intermediate blends.
 */
export function blendedNormal(tangent: Vec2, world: WorldWidth | null): Vec2 {
  const tn: Vec2 = { x: -tangent.y, y: tangent.x };
  if (!world) return tn;
  if (world.blend >= 1) return world.normal;
  const x = tn.x * (1 - world.blend) + world.normal.x * world.blend;
  const y = tn.y * (1 - world.blend) + world.normal.y * world.blend;
  const len = Math.hypot(x, y);
  if (len < 1e-9) return world.normal;
  return { x: x / len, y: y / len };
}

/**
 * One offset sample per anchor: each cubic segment contributes its two
 * endpoints only. Adjacent segments share the corner anchor and stitching
 * (miter / bevel) inserts whatever extra vertices the join needs.
 */
/**
 * One offset sample per anchor: each cubic segment contributes its two
 * endpoints only — PLUS any extra samples adaptive flattening inserts when
 * the cubic is curvy or its width profile bends. Adjacent segments share
 * the corner anchor and stitching (miter / bevel-fallback) inserts whatever
 * extra vertices the join needs.
 */
/** Max perpendicular deviation (in glyph units) of a cubic from its chord
 *  before we recurse. Sub-pixel at typical preview scale. */
const FLATNESS_TOL = 0.25;
/** Max deviation of width(midpoint) from the linear interpolation of width
 *  at the endpoints, in glyph units, before we recurse. Catches strokes
 *  whose centerline is straight but whose width swells. */
const WIDTH_TOL = 0.25;
/** Hard cap on de Casteljau depth. Reached only on truly degenerate inputs. */
const FLATTEN_MAX_DEPTH = 12;
/** A miter is replaced with a bevel-fallback if its length exceeds this × halfWidth. */
const MITER_LIMIT = 6;

/** Linear interpolation of width(t) over a sorted-by-t WidthProfile. */
export function widthAt(profile: WidthProfile, t: number): number {
  const s = profile.samples;
  if (s.length === 0) return 1;
  if (t <= s[0]!.t) return s[0]!.width;
  if (t >= s[s.length - 1]!.t) return s[s.length - 1]!.width;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    if (t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return a.width + (b.width - a.width) * u;
    }
  }
  return s[s.length - 1]!.width;
}

/** Compute (left, right) offset points for a path point with given tangent. */
function offsetPair(
  p: Vec2,
  tangent: Vec2,
  halfWidth: number,
  world: WorldWidth | null,
): { left: Vec2; right: Vec2 } {
  const n = blendedNormal(tangent, world);
  return {
    left: { x: p.x + n.x * halfWidth, y: p.y + n.y * halfWidth },
    right: { x: p.x - n.x * halfWidth, y: p.y - n.y * halfWidth },
  };
}

/** Per-segment offset polylines + endpoint tangents (for miter stitching). */
type SegmentOffsets = {
  readonly lefts: Vec2[];
  readonly rights: Vec2[];
  readonly tangentStart: Vec2;
  readonly tangentEnd: Vec2;
  readonly halfStart: number;
  readonly halfEnd: number;
  readonly pStart: Vec2;
  readonly pEnd: Vec2;
};

function offsetSegment(
  seg: CubicSegment,
  profile: WidthProfile,
  tArcStart: number,
  tArcEnd: number,
  world: WorldWidth | null,
): SegmentOffsets {
  // Adaptive flattening: collect t-values in [0,1] of `seg` such that each
  // consecutive pair bounds a sub-cubic that is "flat enough" both
  // geometrically (perpendicular deviation of the controls from the chord)
  // and width-wise (midpoint width is close to linear interp of endpoint
  // widths). The leaves' endpoints become the offset samples.
  const ts: number[] = [0];
  flattenCubic(seg, profile, tArcStart, tArcEnd, 0, 1, 0, ts);

  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (const t of ts) {
    const p = pointAt(seg, t);
    const tangent = tangentAt(seg, t);
    const tArc = tArcStart + (tArcEnd - tArcStart) * t;
    const half = widthAt(profile, tArc) / 2;
    const { left, right } = offsetPair(p, tangent, half, world);
    lefts.push(left);
    rights.push(right);
  }
  const tangentStart = tangentAt(seg, 0);
  const tangentEnd = tangentAt(seg, 1);
  return {
    lefts,
    rights,
    tangentStart,
    tangentEnd,
    halfStart: widthAt(profile, tArcStart) / 2,
    halfEnd: widthAt(profile, tArcEnd) / 2,
    pStart: pointAt(seg, 0),
    pEnd: pointAt(seg, 1),
  };
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Recursive de Casteljau flattener. `tLo` / `tHi` are the parameter range
 * of `sub` in the ORIGINAL parent segment's parameter space; `tArcStart` /
 * `tArcEnd` are the corresponding stroke-arc t-values for width lookup.
 *
 * Subdivides `sub` at its own t=0.5 until both:
 *   (a) max perp-distance of c1, c2 from the chord p0–p1 ≤ FLATNESS_TOL;
 *   (b) |w(midArc) − ½(w(start) + w(end))| ≤ WIDTH_TOL.
 *
 * Emits `tHi` (in parent space) at every leaf, so `out` ends up containing
 * the right-hand parameter of every leaf in increasing order. Caller seeds
 * `out` with `[0]`; final `out` is the full set of sample t-values.
 */
function flattenCubic(
  sub: CubicSegment,
  profile: WidthProfile,
  tArcStart: number,
  tArcEnd: number,
  tLo: number,
  tHi: number,
  depth: number,
  out: number[],
): void {
  // (a) chord flatness — perpendicular deviation of c1, c2 from chord p0-p1.
  const dx = sub.p1.x - sub.p0.x;
  const dy = sub.p1.y - sub.p0.y;
  const chordLen = Math.hypot(dx, dy);
  let chordOk: boolean;
  if (chordLen < 1e-9) {
    // Degenerate chord (p0 ≈ p1): treat as flat iff the controls also
    // collapse onto the same point. Otherwise it's a cusp/loop — split.
    const d1 = Math.hypot(sub.c1.x - sub.p0.x, sub.c1.y - sub.p0.y);
    const d2 = Math.hypot(sub.c2.x - sub.p0.x, sub.c2.y - sub.p0.y);
    chordOk = Math.max(d1, d2) <= FLATNESS_TOL;
  } else {
    const perp1 =
      Math.abs((sub.c1.x - sub.p0.x) * dy - (sub.c1.y - sub.p0.y) * dx) /
      chordLen;
    const perp2 =
      Math.abs((sub.c2.x - sub.p0.x) * dy - (sub.c2.y - sub.p0.y) * dx) /
      chordLen;
    chordOk = Math.max(perp1, perp2) <= FLATNESS_TOL;
  }

  // (b) width-profile flatness over this t-range.
  const wStart = widthAt(profile, tArcStart);
  const wEnd = widthAt(profile, tArcEnd);
  const wMid = widthAt(profile, (tArcStart + tArcEnd) / 2);
  const widthOk = Math.abs(wMid - (wStart + wEnd) / 2) <= WIDTH_TOL;

  if ((chordOk && widthOk) || depth >= FLATTEN_MAX_DEPTH) {
    out.push(tHi);
    return;
  }

  // de Casteljau split at t=0.5.
  const m01 = mid(sub.p0, sub.c1);
  const m12 = mid(sub.c1, sub.c2);
  const m23 = mid(sub.c2, sub.p1);
  const m012 = mid(m01, m12);
  const m123 = mid(m12, m23);
  const m0123 = mid(m012, m123);
  const left: CubicSegment = { p0: sub.p0, c1: m01, c2: m012, p1: m0123 };
  const right: CubicSegment = { p0: m0123, c1: m123, c2: m23, p1: sub.p1 };

  const tMid = (tLo + tHi) / 2;
  const tArcMid = (tArcStart + tArcEnd) / 2;
  flattenCubic(left, profile, tArcStart, tArcMid, tLo, tMid, depth + 1, out);
  flattenCubic(right, profile, tArcMid, tArcEnd, tMid, tHi, depth + 1, out);
}

/**
 * Intersect two infinite lines defined as point + direction. Returns null
 * when the lines are parallel.
 */
function intersectLines(
  p1: Vec2,
  d1: Vec2,
  p2: Vec2,
  d2: Vec2,
): Vec2 | null {
  // Solve p1 + t*d1 = p2 + s*d2  →  cross product form.
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / denom;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

/**
 * Compute the miter point where the two offset lines (one from the previous
 * segment, one from the next) meet on the given side of the corner.
 *
 * Returns null when the lines are parallel or when the miter would be too
 * long (sharper than MITER_LIMIT × halfWidth) — caller should bevel instead.
 */
function miterPoint(
  side: 'left' | 'right',
  prev: SegmentOffsets,
  next: SegmentOffsets,
): Vec2 | null {
  const lastPrev =
    side === 'left'
      ? prev.lefts[prev.lefts.length - 1]!
      : prev.rights[prev.rights.length - 1]!;
  const firstNext = side === 'left' ? next.lefts[0]! : next.rights[0]!;
  const hit = intersectLines(
    lastPrev,
    prev.tangentEnd,
    firstNext,
    next.tangentStart,
  );
  if (!hit) return null;
  const corner = prev.pEnd;
  const dist = Math.hypot(hit.x - corner.x, hit.y - corner.y);
  const limit = MITER_LIMIT * Math.max(prev.halfEnd, next.halfStart, 0.001);
  if (dist > limit) return null;
  return hit;
}

/** Drop trailing samples of a one-sided polyline that lie past `mp` along `tangent`. */
function trimTail(
  side: Vec2[],
  mp: Vec2,
  tangent: Vec2,
): void {
  // A sample s is "past" mp (further along the tangent) when (s - mp)·tangent > eps.
  // Walk back from the end and pop while that's true; this clips inside-corner
  // overshoot so the polyline ends at the miter point cleanly.
  while (side.length > 1) {
    const s = side[side.length - 1]!;
    const dot = (s.x - mp.x) * tangent.x + (s.y - mp.y) * tangent.y;
    if (dot <= 1e-6) break;
    side.pop();
  }
}

/** Drop leading samples of a one-sided polyline that lie before `mp` along `tangent`. */
function trimHead(
  side: Vec2[],
  mp: Vec2,
  tangent: Vec2,
): void {
  // A sample s at the start is "before" mp when (s - mp)·tangent < -eps.
  while (side.length > 1) {
    const s = side[0]!;
    const dot = (s.x - mp.x) * tangent.x + (s.y - mp.y) * tangent.y;
    if (dot >= -1e-6) break;
    side.shift();
  }
}

/**
 * Build a circular cap as a fan of `steps` points between two endpoints,
 * centered at `center`. Sweeps through the half-plane that the cap should
 * bulge into — defined by `dir` pointing OUTWARD from the stroke (i.e. for
 * an end cap pass the forward tangent; for a start cap pass the reverse of
 * the start tangent). The arc midpoint always lies on the +dir side.
 */
function roundCap(
  center: Vec2,
  from: Vec2,
  to: Vec2,
  dir: Vec2,
  steps: number,
  bulge: number,
): Vec2[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  // Two candidate sweeps reach a1 from a0: clockwise (delta < 0) and
  // counter-clockwise (delta > 0). Their endpoints are the same; their
  // midpoints lie on opposite sides of the chord. Pick the one whose
  // midpoint is on the +dir side (so the arc bulges OUT past the endpoint).
  let dRaw = a1 - a0;
  while (dRaw > Math.PI) dRaw -= 2 * Math.PI;
  while (dRaw < -Math.PI) dRaw += 2 * Math.PI;
  const dOther = dRaw > 0 ? dRaw - 2 * Math.PI : dRaw + 2 * Math.PI;
  const midDot = (d: number): number => {
    const a = a0 + d / 2;
    return Math.cos(a) * dir.x + Math.sin(a) * dir.y;
  };
  const delta = midDot(dRaw) >= midDot(dOther) ? dRaw : dOther;
  const r = Math.hypot(from.x - center.x, from.y - center.y);
  // Decompose each fan point into (along-dir, perp-dir). Bulge scales the
  // along-dir component, so the chord endpoints (along=0) stay anchored.
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const dux = dir.x / dlen;
  const duy = dir.y / dlen;
  const pux = -duy;
  const puy = dux;
  const out: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    const along = px * dux + py * duy;
    const cross = px * pux + py * puy;
    out.push({
      x: center.x + along * bulge * dux + cross * pux,
      y: center.y + along * bulge * duy + cross * puy,
    });
  }
  return out;
}

function buildCap(
  cap: CapShape,
  center: Vec2,
  from: Vec2,
  to: Vec2,
  dir: Vec2,
  bulge: number,
): Vec2[] {
  // `from` and `to` are the perpendicular offset endpoints of the stroke at
  // this cap; the polygon edge from→...→to closes the outline. Returning []
  // gives a FLAT cap (a straight chord between from and to).
  const kind = typeof cap === 'string' ? cap : cap.kind;
  switch (kind) {
    case 'flat':
      return [];
    case 'round': {
      // Half-width = distance from center to either offset endpoint.
      // Use 12 fan points by default — visually smooth at typical glyph zoom.
      return roundCap(center, from, to, dir, 12, bulge);
    }
    case 'tapered': {
      // A single tip point pushed OUT along `dir` by `bulge` half-widths, so
      // the bulge knob also controls how pointy/flat the tapered cap is.
      const half = Math.hypot(from.x - center.x, from.y - center.y);
      const dlen = Math.hypot(dir.x, dir.y) || 1;
      return [
        {
          x: center.x + (dir.x / dlen) * half * bulge,
          y: center.y + (dir.y / dlen) * half * bulge,
        },
      ];
    }
    case 'custom':
      // TODO: custom path caps (CapShape.path). For now fall back to flat.
      return [];
    default:
      return [];
  }
}

export type OutlinePolygon = readonly Vec2[];

/**
 * Build the per-segment offset polylines, then stitch them at interior
 * junctions with miter joins so corners meet at one point on each side
 * instead of overshooting.
 *
 * Returns the final stitched `lefts` / `rights` polylines plus the points and
 * tangents needed to attach start / end caps.
 */
function buildSides(
  stroke: Stroke,
  style: StyleSettings,
): {
  lefts: Vec2[];
  rights: Vec2[];
  pStart: Vec2;
  pEnd: Vec2;
  tangentStart: Vec2;
  tangentEnd: Vec2;
} | null {
  if (stroke.vertices.length < 2) return null;
  // Open-stroke invariant: a stroke is a real pen path, with a distinct
  // moment of touch-down and lift-off. Closed loops are forbidden — they
  // would yield a self-touching annular outline polygon that no fill rule
  // or triangulator can interpret unambiguously.
  const a = stroke.vertices[0]!.p;
  const z = stroke.vertices[stroke.vertices.length - 1]!.p;
  if (a.x === z.x && a.y === z.y) {
    throw new Error(
      `Stroke "${stroke.id}" is closed (first vertex coincides with last). All strokes must have a distinct start and end.`,
    );
  }
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return null;

  const profile = stroke.width ?? style.defaultWidth;
  const world = resolveWorldWidth(style);

  // Approximate per-segment arc-length distribution so width(t) over the
  // whole stroke maps onto each segment's tArcStart / tArcEnd.
  // Cheap proxy: use chord length, which is fine for our short visual strokes.
  const lens = segments.map((s) =>
    Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) || 1,
  );
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const offsets: SegmentOffsets[] = [];
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const tA = acc / total;
    const tB = (acc + lens[i]!) / total;
    offsets.push(
      offsetSegment(segments[i]!, profile, tA, tB, world),
    );
    acc += lens[i]!;
  }

  // Stitch lefts/rights with miter joins, trimming any samples that overshoot
  // the miter intersection (this is what removes the inside-corner artifact
  // where the inner offset polyline previously extended past the meeting
  // point). Pure world-orientation (blend === 1) has a fixed normal so
  // corners are pure translations of the path → no mitering needed there.
  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  // Each entry holds the current segment's left & right polylines being
  // accumulated; we may pop trailing samples from it during stitching.
  let curLefts: Vec2[] = [...offsets[0]!.lefts];
  let curRights: Vec2[] = [...offsets[0]!.rights];

  const fixedTranslation = world !== null && world.blend >= 1;

  for (let i = 0; i < offsets.length - 1; i++) {
    const seg = offsets[i]!;
    const next = offsets[i + 1]!;
    const nextLefts: Vec2[] = [...next.lefts];
    const nextRights: Vec2[] = [...next.rights];

    if (fixedTranslation) {
      // Pure translation: both sides line up by construction. Just push.
      lefts.push(...curLefts);
      rights.push(...curRights);
      // Drop the duplicate junction sample at the head of next.
      nextLefts.shift();
      nextRights.shift();
    } else {
      // Miter join. Compute the miter point on each side; if it exists and is
      // within the miter limit, collapse both polylines to it (trimming any
      // samples that overshoot along the segment tangent so the inside corner
      // stays clean). Otherwise fall back to a bevel — keep both perpendicular
      // endpoints, the polygon edge between them forms an implicit chord.
      const stitch = (
        prevSide: Vec2[],
        nextSide: Vec2[],
        which: 'left' | 'right',
      ): { trimmedPrev: Vec2[]; trimmedNext: Vec2[] } => {
        const prevCopy = [...prevSide];
        const nextCopy = [...nextSide];
        const mp = miterPoint(which, seg, next);
        if (!mp) {
          return { trimmedPrev: prevCopy, trimmedNext: nextCopy };
        }
        prevCopy.pop();
        trimTail(prevCopy, mp, seg.tangentEnd);
        prevCopy.push(mp);
        nextCopy.shift();
        trimHead(nextCopy, mp, next.tangentStart);
        return { trimmedPrev: prevCopy, trimmedNext: nextCopy };
      };

      const L = stitch(curLefts, nextLefts, 'left');
      const R = stitch(curRights, nextRights, 'right');
      lefts.push(...L.trimmedPrev);
      rights.push(...R.trimmedPrev);
      nextLefts.length = 0;
      nextLefts.push(...L.trimmedNext);
      nextRights.length = 0;
      nextRights.push(...R.trimmedNext);
    }

    curLefts = nextLefts;
    curRights = nextRights;
  }
  // Push the last segment's remaining samples.
  lefts.push(...curLefts);
  rights.push(...curRights);

  const first = offsets[0]!;
  const last = offsets[offsets.length - 1]!;

  return {
    lefts,
    rights,
    pStart: first.pStart,
    pEnd: last.pEnd,
    tangentStart: first.tangentStart,
    tangentEnd: last.tangentEnd,
  };
}

/**
 * Outline a single stroke into a closed polygon, given the active style.
 * Stroke-level overrides on `width`, `capStart`, `capEnd` win over the style.
 */
export function outlineStroke(
  stroke: Stroke,
  style: StyleSettings,
): OutlinePolygon {
  const sides = buildSides(stroke, style);
  if (!sides) return [];
  const { lefts, rights, pStart, pEnd, tangentStart, tangentEnd } = sides;
  const capStart = stroke.capStart ?? style.capStart;
  const capEnd = stroke.capEnd ?? style.capEnd;
  const bulge = style.capRoundBulge ?? 1;

  const endCap = buildCap(capEnd, pEnd, lefts[lefts.length - 1]!, rights[rights.length - 1]!, tangentEnd, bulge);
  const startCap = buildCap(
    capStart,
    pStart,
    rights[0]!,
    lefts[0]!,
    { x: -tangentStart.x, y: -tangentStart.y },
    bulge,
  );

  const polygon: Vec2[] = [];
  polygon.push(...lefts);
  polygon.push(...endCap);
  for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
  polygon.push(...startCap);
  return polygon;
}
