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

const SAMPLES_PER_SEGMENT = 24;
/** A miter is replaced with a bevel if its length exceeds this × halfWidth. */
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
  worldNormal: Vec2 | null,
): { left: Vec2; right: Vec2 } {
  // Default: rotate tangent 90° CCW for the left normal.
  const n = worldNormal ?? ({ x: -tangent.y, y: tangent.x } satisfies Vec2);
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
  n: number,
  profile: WidthProfile,
  tArcStart: number,
  tArcEnd: number,
  worldNormal: Vec2 | null,
): SegmentOffsets {
  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pointAt(seg, t);
    const tangent = tangentAt(seg, t);
    const tArc = tArcStart + (tArcEnd - tArcStart) * t;
    const half = widthAt(profile, tArc) / 2;
    const { left, right } = offsetPair(p, tangent, half, worldNormal);
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

/**
 * Build a circular cap as a fan of `steps` points between two endpoints,
 * centered at `center`. `from` is on the left side, `to` on the right.
 * Sweeps through the side opposite the path direction `dir`.
 */
function roundCap(
  center: Vec2,
  from: Vec2,
  to: Vec2,
  dir: Vec2,
  steps: number,
): Vec2[] {
  // We sweep from `from` to `to` through the arc that points opposite to `dir`.
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  // Decide sweep direction such that the midpoint is opposite `dir`.
  let delta = a1 - a0;
  // Normalize to (-PI, PI]
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  // Pick the long way if midpoint of the short way is on the `dir` side.
  const midShort = a0 + delta / 2;
  const mxShort = Math.cos(midShort);
  const myShort = Math.sin(midShort);
  if (mxShort * dir.x + myShort * dir.y > 0) {
    delta = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
  }
  const r = Math.hypot(from.x - center.x, from.y - center.y);
  const out: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    out.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  return out;
}

function buildCap(
  cap: CapShape,
  center: Vec2,
  from: Vec2,
  to: Vec2,
  dir: Vec2,
): Vec2[] {
  switch (cap) {
    case 'flat':
      return [];
    case 'tapered':
      // Single sharp point projected one half-width past the end.
      return [
        {
          x: center.x + dir.x * Math.hypot(from.x - center.x, from.y - center.y),
          y: center.y + dir.y * Math.hypot(from.x - center.x, from.y - center.y),
        },
      ];
    case 'round':
      return roundCap(center, from, to, dir, 12);
    default:
      // 'custom' cap shape: not implemented yet — fall back to round.
      // TODO(decision): custom-cap tracing.
      return roundCap(center, from, to, dir, 12);
  }
}

export type OutlinePolygon = readonly Vec2[];

/** Sub-polylines that make up a stroke outline. Useful for debug overlays. */
export type OutlineParts = {
  /** Left side polyline (in path direction). */
  readonly left: readonly Vec2[];
  /** Right side polyline (in path direction). */
  readonly right: readonly Vec2[];
  /** Cap polyline at the start of the stroke (right[0] → left[0]). */
  readonly startCap: readonly Vec2[];
  /** Cap polyline at the end of the stroke (left[last] → right[last]). */
  readonly endCap: readonly Vec2[];
};

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
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return null;

  const profile = stroke.width ?? style.defaultWidth;
  const worldNormal: Vec2 | null =
    style.widthOrientation === 'world'
      ? { x: -Math.sin(style.worldAngle), y: Math.cos(style.worldAngle) }
      : null;

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
      offsetSegment(segments[i]!, SAMPLES_PER_SEGMENT, profile, tA, tB, worldNormal),
    );
    acc += lens[i]!;
  }

  // Stitch lefts: for each interior junction, replace the two adjacent
  // offset points with a single miter point (or fall back to bevel = keep
  // both points). World-orientation has a fixed normal so corners are pure
  // translations of the path → no mitering needed there.
  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];

  for (let i = 0; i < offsets.length; i++) {
    const seg = offsets[i]!;
    if (i === 0) {
      lefts.push(seg.lefts[0]!);
      rights.push(seg.rights[0]!);
    }
    // Push interior points (skip first to avoid duplicating last of previous).
    for (let j = 1; j < seg.lefts.length - 1; j++) {
      lefts.push(seg.lefts[j]!);
      rights.push(seg.rights[j]!);
    }

    if (i < offsets.length - 1) {
      const next = offsets[i + 1]!;
      if (worldNormal) {
        // Pure translation: both sides line up by construction.
        lefts.push(seg.lefts[seg.lefts.length - 1]!);
        rights.push(seg.rights[seg.rights.length - 1]!);
      } else {
        const ml = miterPoint('left', seg, next);
        const mr = miterPoint('right', seg, next);
        if (ml) {
          lefts.push(ml);
        } else {
          // Bevel: keep both endpoints.
          lefts.push(seg.lefts[seg.lefts.length - 1]!, next.lefts[0]!);
        }
        if (mr) {
          rights.push(mr);
        } else {
          rights.push(seg.rights[seg.rights.length - 1]!, next.rights[0]!);
        }
      }
    } else {
      // Last segment: push its endpoint.
      lefts.push(seg.lefts[seg.lefts.length - 1]!);
      rights.push(seg.rights[seg.rights.length - 1]!);
    }
  }

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
 * Outline a stroke as four separate sub-polylines (left, right, start cap,
 * end cap). Same math as `outlineStroke`, but the parts are not concatenated.
 * Used by editors that want to colorize each border independently.
 */
export function outlineStrokeParts(
  stroke: Stroke,
  style: StyleSettings,
): OutlineParts {
  const empty: OutlineParts = { left: [], right: [], startCap: [], endCap: [] };
  const sides = buildSides(stroke, style);
  if (!sides) return empty;

  const { lefts, rights, pStart, pEnd, tangentStart, tangentEnd } = sides;
  const capStart = stroke.capStart ?? style.capStart;
  const capEnd = stroke.capEnd ?? style.capEnd;
  const endCapPts = buildCap(capEnd, pEnd, lefts[lefts.length - 1]!, rights[rights.length - 1]!, tangentEnd);
  const startCapPts = buildCap(capStart, pStart, rights[0]!, lefts[0]!, { x: -tangentStart.x, y: -tangentStart.y });
  return {
    left: lefts,
    right: rights,
    startCap: [rights[0]!, ...startCapPts, lefts[0]!],
    endCap: [lefts[lefts.length - 1]!, ...endCapPts, rights[rights.length - 1]!],
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

  const endCap = buildCap(capEnd, pEnd, lefts[lefts.length - 1]!, rights[rights.length - 1]!, tangentEnd);
  const startCap = buildCap(
    capStart,
    pStart,
    rights[0]!,
    lefts[0]!,
    { x: -tangentStart.x, y: -tangentStart.y },
  );

  const polygon: Vec2[] = [];
  polygon.push(...lefts);
  polygon.push(...endCap);
  for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
  polygon.push(...startCap);
  return polygon;
}
