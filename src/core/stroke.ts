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

const clampLow = (v: number, lo: number): number => (v < lo ? lo : v);
const clamp01ToOne = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  // Now dRaw is in (-π, π]. The other sweep is dRaw ± 2π (opposite sign).
  const dOther = dRaw > 0 ? dRaw - 2 * Math.PI : dRaw + 2 * Math.PI;
  const midDot = (d: number): number => {
    const a = a0 + d / 2;
    return Math.cos(a) * dir.x + Math.sin(a) * dir.y;
  };
  const delta = midDot(dRaw) >= midDot(dOther) ? dRaw : dOther;
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

  // Stitch lefts/rights with miter joins, trimming any samples that overshoot
  // the miter intersection (this is what removes the inside-corner artifact
  // where the inner offset polyline previously extended past the meeting
  // point). World-orientation has a fixed normal so corners are pure
  // translations of the path → no mitering needed there.
  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  // Each entry holds the current segment's left & right polylines being
  // accumulated; we may pop trailing samples from it during stitching.
  let curLefts: Vec2[] = [...offsets[0]!.lefts];
  let curRights: Vec2[] = [...offsets[0]!.rights];

  for (let i = 0; i < offsets.length - 1; i++) {
    const seg = offsets[i]!;
    const next = offsets[i + 1]!;
    const nextLefts: Vec2[] = [...next.lefts];
    const nextRights: Vec2[] = [...next.rights];

    if (worldNormal) {
      // Pure translation: both sides line up by construction. Just push.
      lefts.push(...curLefts);
      rights.push(...curRights);
      // Drop the duplicate junction sample at the head of next.
      nextLefts.shift();
      nextRights.shift();
    } else {
      // Per-anchor join style. The corner anchor is `stroke.vertices[i+1]`.
      const anchor = stroke.vertices[i + 1]!;
      const cornerJoin = anchor.corner ?? 'miter';
      const bevelAmount = clampLow(style.bevelAmount ?? 1, 0);
      const bevelMode = clamp01ToOne(style.bevelMode ?? 0);

      const tryStitch = (
        prevSide: Vec2[],
        nextSide: Vec2[],
        which: 'left' | 'right',
      ): { trimmedPrev: Vec2[]; trimmedNext: Vec2[] } => {
        const prevCopy = [...prevSide];
        const nextCopy = [...nextSide];

        const mp = miterPoint(which, seg, next);
        if (!mp) {
          // Parallel or beyond miter limit → keep both perpendicular endpoints
          // (degenerate fallback, same as a full bevel).
          return { trimmedPrev: prevCopy, trimmedNext: nextCopy };
        }

        // For sharp miter (or bevelAmount=0) just collapse to mp on both
        // sides. Always trim any samples that overshoot mp along the
        // segment tangent so the inside corner stays clean.
        if (cornerJoin === 'miter' || bevelAmount <= 0) {
          prevCopy.pop();
          trimTail(prevCopy, mp, seg.tangentEnd);
          prevCopy.push(mp);
          nextCopy.shift();
          trimHead(nextCopy, mp, next.tangentStart);
          return { trimmedPrev: prevCopy, trimmedNext: nextCopy };
        }

        // Bevel. Two interpretations of "amount > 1", blended by `bevelMode`:
        //
        //  Mode A — into-body (mode=0):
        //    For amount in [0,1]: bev = lerp(mp, perp, amount).
        //    For amount > 1:     bev = perp + (amount-1) * |k| * (-tangent),
        //                        i.e. walk backward along the offset polyline
        //                        into the stroke body. Symmetric inside/out.
        //
        //  Mode B — past-anchor (mode=1):
        //    bev = mp + amount * (perp - mp), always.
        //    On outside this also walks into the body (because perp - mp
        //    points into the body there). On inside it walks the other way
        //    into empty space (the classic miter-spike look).
        //
        // For amount ≤ 1 both modes coincide. The two are blended linearly
        // by `bevelMode` ∈ [0,1].
        const perpPrev = prevCopy[prevCopy.length - 1]!;
        const perpNext = nextCopy[0]!;
        const kPrev =
          (mp.x - perpPrev.x) * seg.tangentEnd.x +
          (mp.y - perpPrev.y) * seg.tangentEnd.y;
        const kNext =
          (perpNext.x - mp.x) * next.tangentStart.x +
          (perpNext.y - mp.y) * next.tangentStart.y;
        const absKPrev = Math.abs(kPrev);
        const absKNext = Math.abs(kNext);

        // Mode B: linear extrapolation past `perp`.
        const bevPrevB: Vec2 = {
          x: mp.x - bevelAmount * kPrev * seg.tangentEnd.x,
          y: mp.y - bevelAmount * kPrev * seg.tangentEnd.y,
        };
        const bevNextB: Vec2 = {
          x: mp.x + bevelAmount * kNext * next.tangentStart.x,
          y: mp.y + bevelAmount * kNext * next.tangentStart.y,
        };

        // Mode A: clamp at perp for amount=1, then walk into body.
        let bevPrevA: Vec2;
        let bevNextA: Vec2;
        if (bevelAmount <= 1) {
          bevPrevA = bevPrevB;
          bevNextA = bevNextB;
        } else {
          const extra = bevelAmount - 1;
          // Body direction at prev's end = -tangentEnd (back along the seg).
          bevPrevA = {
            x: perpPrev.x - extra * absKPrev * seg.tangentEnd.x,
            y: perpPrev.y - extra * absKPrev * seg.tangentEnd.y,
          };
          // Body direction at next's start = +tangentStart (forward into seg).
          bevNextA = {
            x: perpNext.x + extra * absKNext * next.tangentStart.x,
            y: perpNext.y + extra * absKNext * next.tangentStart.y,
          };
        }

        const bevPrev: Vec2 = {
          x: bevPrevA.x + bevelMode * (bevPrevB.x - bevPrevA.x),
          y: bevPrevA.y + bevelMode * (bevPrevB.y - bevPrevA.y),
        };
        const bevNext: Vec2 = {
          x: bevNextA.x + bevelMode * (bevNextB.x - bevNextA.x),
          y: bevNextA.y + bevelMode * (bevNextB.y - bevNextA.y),
        };

        prevCopy.pop();
        trimTail(prevCopy, bevPrev, seg.tangentEnd);
        prevCopy.push(bevPrev);
        nextCopy.shift();
        trimHead(nextCopy, bevNext, next.tangentStart);
        nextCopy.unshift(bevNext);
        return { trimmedPrev: prevCopy, trimmedNext: nextCopy };
      };

      const L = tryStitch(curLefts, nextLefts, 'left');
      const R = tryStitch(curRights, nextRights, 'right');
      lefts.push(...L.trimmedPrev);
      rights.push(...R.trimmedPrev);
      // Replace next's head with the trimmed version for the next iteration.
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
 * Segment-segment intersection test (proper, parameterized). Returns the
 * intersection point and parameters (s along AB, t along CD) only if both
 * fall strictly inside (0, 1). Coincident / parallel segments return null.
 */
function segIntersect(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { p: Vec2; s: number; t: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const sV = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * sV.y - r.y * sV.x;
  if (Math.abs(denom) < 1e-12) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const s = (qp.x * sV.y - qp.y * sV.x) / denom;
  const t = (qp.x * r.y - qp.y * r.x) / denom;
  const eps = 1e-6;
  if (s <= eps || s >= 1 - eps) return null;
  if (t <= eps || t >= 1 - eps) return null;
  return { p: { x: a.x + s * r.x, y: a.y + s * r.y }, s, t };
}

/**
 * Resolve self-intersections in a closed polygon by snipping spike loops.
 *
 * Algorithm (per pass):
 *   - For each edge `i → i+1`, look forward up to `window` edges. If edge
 *     `j → j+1` intersects edge `i`, the vertices in the open interval
 *     `(i+1 … j)` form a self-intersecting loop. Replace them with a single
 *     vertex at the intersection point, "snipping" the loop off.
 *   - Then weld any adjacent vertices that are within `weldEps` of each
 *     other; merged vertices effectively halt further bevel propagation.
 *
 * `bevelAmount` controls strictness:
 *   - amount ≤ 0 → return polygon unchanged.
 *   - amount → 20 → wider lookahead window and larger weld distance, so
 *     even mild near-overlaps and small loops are removed.
 *
 * The clipper only acts on TRUE geometric self-intersection, so legitimate
 * sharp glyph corners and round / tapered / flat caps (which never cross
 * themselves) are untouched.
 */
function softenSpikes(poly: Vec2[], bevelAmount: number): Vec2[] {
  if (bevelAmount <= 0 || poly.length < 4) return poly;
  const f = Math.min(1, bevelAmount / 20);
  // Lookahead window grows with strictness: 4 edges (lax) → 16 edges (strict).
  const window = Math.max(4, Math.round(4 + 12 * f));
  // Weld distance grows with strictness: 0.05 (lax) → 1.0 (strict) units.
  const weldEps = 0.05 + 0.95 * f;

  let cur: Vec2[] = poly.slice();
  for (let pass = 0; pass < 16; pass++) {
    const n = cur.length;
    if (n < 4) break;

    // 1. Find the first self-intersection within the lookahead window and
    //    snip the loop. Restart the scan from the snip point next pass.
    let snipped = false;
    outer: for (let i = 0; i < n; i++) {
      const a = cur[i]!;
      const b = cur[(i + 1) % n]!;
      for (let k = 2; k <= window; k++) {
        const j = (i + k) % n;
        const jNext = (j + 1) % n;
        // Skip if the forward edge wraps to touch i (adjacent edges).
        if (jNext === i) continue;
        const c = cur[j]!;
        const d = cur[jNext]!;
        const hit = segIntersect(a, b, c, d);
        if (!hit) continue;
        // Snip vertices (i+1 … j) inclusive, replace with hit.p.
        const next: Vec2[] = [];
        // Walk from (i+1)%n forward to j, those go away. Keep everything
        // else; insert hit.p in their place.
        let idx = (i + 1) % n;
        // Add vertices BEFORE the snipped range, starting just after j.
        let kept = jNext;
        // We'll rebuild: start at i, push cur[i], push hit.p, then continue
        // from jNext to (i in cyclic order back), avoiding the snipped span.
        next.push(a);
        next.push(hit.p);
        let cursor = jNext;
        // Walk until we loop back to i (exclusive).
        while (cursor !== i) {
          next.push(cur[cursor]!);
          cursor = (cursor + 1) % n;
        }
        cur = next;
        snipped = true;
        // Avoid unused-var warnings from idx/kept (kept for readability).
        void idx;
        void kept;
        break outer;
      }
    }
    if (snipped) continue;

    // 2. No more self-intersections — weld neighboring vertices that have
    //    collapsed within weldEps. Welded pairs become one anchor and stop
    //    the bevel chain at that point.
    const welded: Vec2[] = [];
    let weldedAny = false;
    for (let i = 0; i < n; i++) {
      const p = cur[i]!;
      const q = welded[welded.length - 1] ?? null;
      if (q && Math.hypot(p.x - q.x, p.y - q.y) <= weldEps) {
        // Merge into the existing tail at the midpoint.
        welded[welded.length - 1] = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        weldedAny = true;
      } else {
        welded.push(p);
      }
    }
    // Wrap-around weld between last and first.
    if (welded.length >= 2) {
      const first = welded[0]!;
      const last = welded[welded.length - 1]!;
      if (Math.hypot(first.x - last.x, first.y - last.y) <= weldEps) {
        welded[0] = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
        welded.pop();
        weldedAny = true;
      }
    }
    if (!weldedAny) return cur;
    cur = welded;
  }
  return cur;
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
  return softenSpikes(polygon, style.bevelAmount ?? 1);
}
