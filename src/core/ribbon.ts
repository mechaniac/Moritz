/**
 * Ribbon (quad-strip) triangulation of a stroke.
 *
 * Hierarchy (each level is an integer subdivision of the previous):
 *
 *   spline0      = the user-defined cubic Bezier spline (Stroke.vertices →
 *                  CubicSegment[]). The "core" of the glyph.
 *
 *   spline1      = spline0 evaluated at evenly distributed positions inside
 *                  every segment. `spineSubdiv` extra interior vertices are
 *                  inserted between each pair of spline0 anchors. At each
 *                  vertex we record point + (world-bent) outward normal.
 *
 *   bordersplines= for each spline1 vertex, extend ±halfWidth along the
 *                  blended normal. Yields two parallel polylines (left,
 *                  right) with EQUAL vertex counts.
 *
 *   shape verts  = `borderSubdiv` Catmull-Rom interpolations inserted
 *                  between every consecutive pair of border-polyline
 *                  vertices. Original border vertices are preserved
 *                  exactly; the inserted ones round / smooth the
 *                  silhouette so higher subdiv values produce a
 *                  smoother shape (not just more points on the same
 *                  chord). Caps (round / flat / tapered) attach at the
 *                  two endpoint pairs.
 *
 * Every step is a perfect integer subdivision (0 = none, 1 = one vertex
 * inserted between each pair, 2 = two, ...). No fractional sampling, no
 * adaptive flattening, no miter math at interior anchors — at an anchor
 * we use the average of the in/out tangents and a single normal.
 *
 * Distribution within a Bezier segment is arc-length-uniform (using a
 * per-segment chord LUT) so that integer subdivisions look visually even
 * regardless of how the cubic's parameter speed varies.
 *
 * The world-bend behaviour — the perpendicular's angle being interpolated
 * toward `style.worldAngle` — is handled by `blendedNormal` from
 * stroke.ts, which mathematically guarantees the offset stays on the
 * correct side of the centerline.
 */

import {
  pointAt,
  segmentLength,
  strokeToSegments,
  tangentAt,
  type CubicSegment,
} from './bezier.js';
import { blendedNormal, contractFactor, resolveWorldWidth, vertexFrameAt, widthAt, type WorldWidth } from './stroke.js';
import type { Stroke, StyleSettings, Vec2 } from './types.js';
import type { WidthMod } from './widthEffects.js';
import type { Triangle } from './triangulate.js';

/** Spine vertex = one sample on spline1 with its outward normal. */
type SpineVertex = {
  readonly p: Vec2;          // point on spline0 (the centerline)
  readonly tangent: Vec2;    // unit tangent at that point
  readonly normal: Vec2;     // unit normal, world-blended; left = p + half·n
  readonly half: number;     // half-width at this arc fraction
  readonly tArc: number;     // arc-length fraction along the whole stroke
};

export type RibbonOptions = {
  /** Vertices inserted BETWEEN each pair of spline0 anchors. Integer ≥ 0. */
  readonly spineSubdiv: number;
  /** Vertices inserted between each pair of border-polyline vertices. Integer ≥ 0. */
  readonly borderSubdiv: number;
  /** Cap fan steps (round caps). Integer ≥ 1. Defaults to spineSubdiv+2. */
  readonly capSubdiv?: number;
  /**
   * Extra spline1 samples added on each side of any broken-tangent anchor.
   * Each iteration halves the gap between the anchor and its closest
   * existing sample. Integer ≥ 0.
   */
  readonly brokenAnchorSubdiv?: number;
  /**
   * If true, distribute spine subdivisions across segments based on each
   * segment's arc length. Step size is `referenceLength / (spineSubdiv+1)`,
   * so `spineSubdiv` describes the count for a segment of `referenceLength`
   * arc; longer segments get more interior vertices, shorter ones fewer.
   * Each segment still gets an integer count and uniform spacing within
   * itself. Falls back to per-stroke average length if `referenceLength`
   * is not provided.
   */
  readonly spineLengthAware?: boolean;
  /**
   * Reference arc length for `spineLengthAware`. Pass the glyph's box
   * height (or any glyph-level scale) so segments across DIFFERENT strokes
   * are comparable. If omitted while `spineLengthAware` is on, defaults to
   * the per-stroke average (which makes single-segment strokes always get
   * exactly `spineSubdiv`).
   */
  readonly referenceLength?: number;
};

export type RibbonResult = {
  readonly polygon: Vec2[];
  readonly triangles: Triangle[];
};

/** Per-segment chord LUT for arc-length-uniform sampling within a segment. */
const ARC_LUT_SAMPLES = 32;

function buildArcLut(seg: CubicSegment): readonly number[] {
  const lut = new Array<number>(ARC_LUT_SAMPLES + 1);
  lut[0] = 0;
  let prev = pointAt(seg, 0);
  let acc = 0;
  for (let i = 1; i <= ARC_LUT_SAMPLES; i++) {
    const p = pointAt(seg, i / ARC_LUT_SAMPLES);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    lut[i] = acc;
    prev = p;
  }
  return lut;
}

/** Invert an arc-length LUT: arc fraction f in [0,1] → segment parameter t. */
function tForArcFraction(lut: readonly number[], f: number): number {
  const total = lut[lut.length - 1]!;
  if (total <= 0) return f;
  const target = f * total;
  let lo = 0;
  let hi = lut.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lut[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = lut[lo]!;
  const b = lut[hi]!;
  const u = b > a ? (target - a) / (b - a) : 0;
  return (lo + u) / ARC_LUT_SAMPLES;
}

function unitOrZero(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

/**
 * Build the arc-length fractions f∈(0,1) at which a segment should be
 * sampled on top of its two endpoint anchors. Returns the union of:
 *   - the uniform interior grid f = k/(N+1) for k=1..N (N = spineSubdiv)
 *   - if `breakStart`: B halvings toward f=0, starting from the closest
 *     existing fraction f0 (or f0=1 when N=0): f0/2, f0/4, …, f0/2^B
 *   - if `breakEnd`: mirror toward f=1
 * Sorted ascending, deduped within a small epsilon.
 */
function segmentSampleFractions(
  spineSubdiv: number,
  brokenAnchorSubdiv: number,
  breakStart: boolean,
  breakEnd: boolean,
): number[] {
  const fs: number[] = [];
  for (let k = 1; k <= spineSubdiv; k++) fs.push(k / (spineSubdiv + 1));
  if (brokenAnchorSubdiv > 0) {
    if (breakStart) {
      const f0 = fs.length > 0 ? fs[0]! : 1;
      let f = f0;
      for (let k = 0; k < brokenAnchorSubdiv; k++) {
        f = f * 0.5;
        fs.push(f);
      }
    }
    if (breakEnd) {
      const endAnchor =
        spineSubdiv > 0 ? spineSubdiv / (spineSubdiv + 1) : 0;
      let gap = 1 - endAnchor;
      for (let k = 0; k < brokenAnchorSubdiv; k++) {
        gap = gap * 0.5;
        fs.push(1 - gap);
      }
    }
  }
  fs.sort((a, b) => a - b);
  // Dedupe (geometrical halvings can in principle coincide with uniform
  // grid points only when brokenAnchorSubdiv==0 with N≥1, which we already
  // skipped; keep this guard for safety).
  const eps = 1e-9;
  const out: number[] = [];
  for (const f of fs) {
    if (out.length === 0 || Math.abs(out[out.length - 1]! - f) > eps) out.push(f);
  }
  return out;
}

/**
 * Build spline1: spine0 anchors + arc-length-uniform interior vertices per
 * segment, optionally densified near broken-tangent anchors. At interior
 * anchors the in/out tangents are averaged (single tangent ⇒ single normal
 * ⇒ single offset point per side, no miter trickery).
 */
function buildSpine1(
  segments: readonly CubicSegment[],
  vertices: readonly import('./types.js').Vertex[],
  spineSubdiv: number,
  profile: import('./types.js').WidthProfile,
  widthMod: WidthMod | null,
  world: WorldWidth | null,
  breakFlags: readonly boolean[],
  brokenAnchorSubdiv: number,
  spineLengthAware: boolean,
  referenceLength: number | undefined,
): SpineVertex[] {
  const lens = segments.map(segmentLength);
  const total = lens.reduce((s, x) => s + x, 0) || 1;
  const cum: number[] = [0];
  for (let i = 0; i < lens.length; i++) cum.push(cum[i]! + lens[i]!);
  const luts = segments.map(buildArcLut);

  // Per-segment per-anchor override frames (deltaAngle, factor at each
  // endpoint). Identity (0, 1) when no override is set; the math then
  // collapses to perp(tangent) + bare profile half-width.
  const segFrames = segments.map((seg, i) => {
    const tan0 = tangentAt(seg, 0);
    const tan1 = tangentAt(seg, 1);
    const tArc0 = cum[i]! / total;
    const tArc1 = cum[i + 1]! / total;
    const bareH0 = widthAt(profile, tArc0) / 2;
    const bareH1 = widthAt(profile, tArc1) / 2;
    return {
      start: vertexFrameAt(vertices[i]!, tan0, bareH0),
      end: vertexFrameAt(vertices[i + 1]!, tan1, bareH1),
    };
  });

  // Per-segment integer subdivision count. Without length-awareness, every
  // segment gets the global `spineSubdiv`. With it, the global value sets a
  // step size measured against `referenceLength` (if provided — typically
  // the glyph box height so segments across strokes are comparable) or the
  // per-stroke average otherwise. Step = ref / (spineSubdiv + 1).
  const perSegSubdiv: number[] = (() => {
    if (!spineLengthAware) return segments.map(() => spineSubdiv);
    const ref = referenceLength && referenceLength > 0
      ? referenceLength
      : total / segments.length;
    const step = ref > 0 ? ref / (spineSubdiv + 1) : 0;
    if (step <= 0) return segments.map(() => spineSubdiv);
    return lens.map((l) => Math.max(0, Math.round(l / step) - 1));
  })();

  const sampleAt = (segIdx: number, t: number, tangentOverride?: Vec2): SpineVertex => {
    const seg = segments[segIdx]!;
    const p = pointAt(seg, t);
    const tan = unitOrZero(tangentOverride ?? tangentAt(seg, t));
    const tArc = (cum[segIdx]! + lens[segIdx]! * t) / total;
    const bareHalf = widthAt(profile, tArc) / 2;
    // Apply per-vertex override frame interpolated across the segment.
    const f = segFrames[segIdx]!;
    const da = (1 - t) * f.start.deltaAngle + t * f.end.deltaAngle;
    const wf = (1 - t) * f.start.factor + t * f.end.factor;
    const dnx = -tan.y;
    const dny = tan.x;
    let baseN: Vec2;
    if (da === 0) {
      baseN = { x: dnx, y: dny };
    } else {
      const c = Math.cos(da);
      const s = Math.sin(da);
      baseN = { x: dnx * c - dny * s, y: dnx * s + dny * c };
    }
    const half = bareHalf * wf * (widthMod ? widthMod(tArc) : 1);
    const normal = blendedNormal(baseN, world);
    const halfContracted = half * contractFactor(baseN, world);
    return { p, tangent: tan, normal, half: halfContracted, tArc };
  };

  const out: SpineVertex[] = [];
  // Start anchor (segment 0, t=0).
  out.push(sampleAt(0, 0));
  for (let s = 0; s < segments.length; s++) {
    // Interior subdivisions of segment s, arc-length-uniform via LUT,
    // densified near any broken-tangent endpoints.
    const breakStart = breakFlags[s] === true;
    const breakEnd = breakFlags[s + 1] === true;
    const fs = segmentSampleFractions(perSegSubdiv[s]!, brokenAnchorSubdiv, breakStart, breakEnd);
    for (const f of fs) {
      const t = tForArcFraction(luts[s]!, f);
      out.push(sampleAt(s, t));
    }
    // Anchor at the END of segment s. For interior anchors (s < N-1),
    // average the outgoing tangent of seg[s] with the incoming tangent of
    // seg[s+1] for a clean, kink-aware single-normal offset.
    if (s < segments.length - 1) {
      const tPrev = tangentAt(segments[s]!, 1);
      const tNext = tangentAt(segments[s + 1]!, 0);
      const avg = unitOrZero({ x: tPrev.x + tNext.x, y: tPrev.y + tNext.y });
      out.push(sampleAt(s, 1, avg));
    } else {
      // Final end anchor — straightforward.
      out.push(sampleAt(s, 1));
    }
  }
  return out;
}

/** Build the two border polylines from spline1: left = p + half·n, right = p − half·n. */
function buildBorders(spine: readonly SpineVertex[]): { lefts: Vec2[]; rights: Vec2[] } {
  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (const v of spine) {
    lefts.push({ x: v.p.x + v.normal.x * v.half, y: v.p.y + v.normal.y * v.half });
    rights.push({ x: v.p.x - v.normal.x * v.half, y: v.p.y - v.normal.y * v.half });
  }
  return { lefts, rights };
}

/**
 * Subdivide a polyline by inserting `borderSubdiv` interpolated vertices
 * between every consecutive pair. Inserted vertices follow a uniform
 * Catmull-Rom spline through the original polyline so subdivision
 * ROUNDS / SMOOTHS the silhouette rather than producing more low-poly
 * segments along the same chord. Original vertices are kept exactly
 * (Catmull-Rom is interpolating), which preserves the strip's
 * left/right index correspondence and the anchor-coincident endpoints.
 *
 * At the open ends we mirror the neighbor (`P0 = 2·P1 − P2`,
 * `P3 = 2·Pn − P(n−1)`) so the spline's slope at the cap matches the
 * direction the border was already heading — no kink at the joint
 * between the strip and its end-cap fan.
 */
function subdivideBorder(border: readonly Vec2[], borderSubdiv: number): Vec2[] {
  if (borderSubdiv <= 0 || border.length < 2) return border.slice();
  const n = border.length;
  const out: Vec2[] = [];
  out.push(border[0]!);
  for (let i = 0; i < n - 1; i++) {
    const p1 = border[i]!;
    const p2 = border[i + 1]!;
    const p0 = i > 0
      ? border[i - 1]!
      : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = i + 2 < n
      ? border[i + 2]!
      : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    for (let k = 1; k <= borderSubdiv; k++) {
      const t = k / (borderSubdiv + 1);
      const t2 = t * t;
      const t3 = t2 * t;
      // Uniform Catmull-Rom (tension = 0.5).
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      out.push({ x, y });
    }
    out.push(p2);
  }
  return out;
}

/** Resolve a CapShape to a kind handled by the ribbon emitter. */
function capKind(c: import('./types.js').CapShape): 'flat' | 'round' | 'tapered' {
  if (c === 'flat' || c === 'round' || c === 'tapered') return c;
  return 'flat';
}

/**
 * Triangulate a stroke as a quad-strip ribbon with optional caps.
 * Open-stroke invariant matches outlineStroke (closed strokes throw).
 */
export function triangulateStrokeRibbon(
  stroke: Stroke,
  style: StyleSettings,
  opts: RibbonOptions,
  widthMod?: WidthMod | null,
): RibbonResult {
  if (stroke.vertices.length < 2) return { polygon: [], triangles: [] };
  const a = stroke.vertices[0]!.p;
  const z = stroke.vertices[stroke.vertices.length - 1]!.p;
  if (a.x === z.x && a.y === z.y) {
    throw new Error(
      `Stroke "${stroke.id}" is closed; ribbon triangulator requires open strokes.`,
    );
  }
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return { polygon: [], triangles: [] };

  const profile = stroke.width ?? style.defaultWidth;
  const world = resolveWorldWidth(style);
  const spineSubdiv = Math.max(0, Math.floor(opts.spineSubdiv));
  const borderSubdiv = Math.max(0, Math.floor(opts.borderSubdiv));
  const capSubdiv = Math.max(1, Math.floor(opts.capSubdiv ?? spineSubdiv + 2));
  const brokenAnchorSubdiv = Math.max(0, Math.floor(opts.brokenAnchorSubdiv ?? 0));
  const spineLengthAware = opts.spineLengthAware === true;
  const referenceLength = opts.referenceLength;
  const breakFlags = stroke.vertices.map((v) => v.breakTangent === true);

  // ----- Hierarchy -----
  const spine = buildSpine1(
    segments,
    stroke.vertices,
    spineSubdiv,
    profile,
    widthMod ?? null,
    world,
    breakFlags,
    brokenAnchorSubdiv,
    spineLengthAware,
    referenceLength,
  );
  const { lefts: leftBorder, rights: rightBorder } = buildBorders(spine);
  const lefts = subdivideBorder(leftBorder, borderSubdiv);
  const rights = subdivideBorder(rightBorder, borderSubdiv);
  // Invariant: equal-length parallel sequences, anchor-coincident at index 0 and N-1.
  if (lefts.length !== rights.length || lefts.length < 2) {
    return { polygon: [], triangles: [] };
  }

  // ----- Cap geometry -----
  const startV = spine[0]!;
  const endV = spine[spine.length - 1]!;
  const capStartShape = capKind(stroke.capStart ?? style.capStart);
  const capEndShape = capKind(stroke.capEnd ?? style.capEnd);
  const bulge = style.capRoundBulge ?? 1;

  // ----- Polygon assembly -----
  // Layout (CCW around the shape, in this order):
  //   [0 .. L-1]              left border, start → end
  //   [L .. L+capEndN]        end-cap fan vertices (excl. first & last,
  //                           which ARE the left/right end-border points)
  //   [.. .. M]               right border, end → start (REVERSED)
  //   [M+1 .. M+capStartN]    start-cap fan vertices
  //
  // Triangles are emitted as a quad strip across left/right pairs plus the
  // cap fans/triangles around the two centerline endpoints.
  const polygon: Vec2[] = [];
  const triangles: Triangle[] = [];

  // Lefts forward.
  const leftIdx: number[] = [];
  for (const p of lefts) {
    leftIdx.push(polygon.length);
    polygon.push(p);
  }
  const leftEndIdx = leftIdx[leftIdx.length - 1]!;
  const leftStartIdx = leftIdx[0]!;

  /**
   * Emit a deterministic cap arching between two existing border endpoints
   * `from` and `to`, bulging in the direction of `tangentBias` (i.e. the
   * cap's apex is pushed perpendicular to the chord on the side that has
   * positive dot with `tangentBias`). NO dependency on the spine normal
   * sign or worldBlend value — always a clean, symmetric half-bulge.
   *
   * Returns the indices of the cap-interior vertices in the order they
   * were appended (so `[from, ...interior, to]` is the cap chord polyline).
   */
  const emitRoundCapInterior = (from: Vec2, to: Vec2, tangentBias: Vec2): number[] => {
    const interior: number[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const chord = Math.hypot(dx, dy);
    if (chord === 0) return interior;
    let perpX = -dy / chord;
    let perpY = dx / chord;
    if (perpX * tangentBias.x + perpY * tangentBias.y < 0) {
      perpX = -perpX;
      perpY = -perpY;
    }
    const radius = chord * 0.5 * bulge;
    for (let k = 1; k < capSubdiv; k++) {
      const theta = (Math.PI * k) / capSubdiv;
      const along = (1 - Math.cos(theta)) * 0.5;
      const out = Math.sin(theta) * radius;
      polygon.push({
        x: from.x + dx * along + perpX * out,
        y: from.y + dy * along + perpY * out,
      });
      interior.push(polygon.length - 1);
    }
    return interior;
  };

  /** Tapered cap: single tip vertex bulged perpendicular to chord. */
  const emitTaperedTip = (from: Vec2, to: Vec2, tangentBias: Vec2): number => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const chord = Math.hypot(dx, dy);
    let perpX = chord > 0 ? -dy / chord : -tangentBias.y;
    let perpY = chord > 0 ? dx / chord : tangentBias.x;
    if (perpX * tangentBias.x + perpY * tangentBias.y < 0) {
      perpX = -perpX;
      perpY = -perpY;
    }
    const out = chord * 0.5 * bulge;
    polygon.push({
      x: (from.x + to.x) * 0.5 + perpX * out,
      y: (from.y + to.y) * 0.5 + perpY * out,
    });
    return polygon.length - 1;
  };

  // ----- End cap (from leftEnd around pEnd to rightEnd) -----
  const rightIdx: number[] = new Array(rights.length);
  const lLast = lefts[lefts.length - 1]!;
  const rLast = rights[rights.length - 1]!;
  if (capEndShape === 'round') {
    const interior = emitRoundCapInterior(lLast, rLast, endV.tangent);
    // Push rights reversed AFTER cap interior so polygon stays CCW.
    for (let i = rights.length - 1; i >= 0; i--) {
      rightIdx[i] = polygon.length;
      polygon.push(rights[i]!);
    }
    const rightEndIdx = rightIdx[rights.length - 1]!;
    // Fan from pEnd-anchor vertex would be unstable; instead fan from leftEnd.
    let prevIdx = leftEndIdx;
    for (const k of interior) {
      triangles.push([leftEndIdx, prevIdx, k]);
      // (degenerate when prevIdx === leftEndIdx; harmless and rendered as zero-area)
      prevIdx = k;
    }
    triangles.push([leftEndIdx, prevIdx, rightEndIdx]);
  } else if (capEndShape === 'tapered') {
    const tipIdx = emitTaperedTip(lLast, rLast, endV.tangent);
    for (let i = rights.length - 1; i >= 0; i--) {
      rightIdx[i] = polygon.length;
      polygon.push(rights[i]!);
    }
    triangles.push([leftEndIdx, tipIdx, rightIdx[rights.length - 1]!]);
  } else {
    // flat
    for (let i = rights.length - 1; i >= 0; i--) {
      rightIdx[i] = polygon.length;
      polygon.push(rights[i]!);
    }
  }

  const rightStartIdx = rightIdx[0]!;

  // ----- Start cap (from rightStart around pStart to leftStart) -----
  const lFirst = lefts[0]!;
  const rFirst = rights[0]!;
  // Bulge in the −tangent direction at the start (cap is "behind" the spine).
  const startBias: Vec2 = { x: -startV.tangent.x, y: -startV.tangent.y };
  if (capStartShape === 'round') {
    const interior = emitRoundCapInterior(rFirst, lFirst, startBias);
    let prevIdx = rightStartIdx;
    for (const k of interior) {
      triangles.push([rightStartIdx, prevIdx, k]);
      prevIdx = k;
    }
    triangles.push([rightStartIdx, prevIdx, leftStartIdx]);
  } else if (capStartShape === 'tapered') {
    const tipIdx = emitTaperedTip(rFirst, lFirst, startBias);
    triangles.push([rightStartIdx, tipIdx, leftStartIdx]);
  }
  // flat: nothing to emit; the polygon edge already closes the cap.

  // ----- Quad strip across left/right pairs -----
  for (let i = 0; i < lefts.length - 1; i++) {
    const l0 = leftIdx[i]!;
    const l1 = leftIdx[i + 1]!;
    const r0 = rightIdx[i]!;
    const r1 = rightIdx[i + 1]!;
    triangles.push([l0, l1, r1]);
    triangles.push([l0, r1, r0]);
  }

  return { polygon, triangles };
}

// ---------------------------------------------------------------------------
// Debug helpers (used by the editor / overlay views; pure functions).
// ---------------------------------------------------------------------------

export type Spline0DebugAnchor = {
  readonly p: Vec2;
  /** Unit incoming tangent at the anchor (zero if anchor is an endpoint or has no in-handle). */
  readonly tangentIn: Vec2;
  /** Unit outgoing tangent at the anchor (zero if anchor is an endpoint or has no out-handle). */
  readonly tangentOut: Vec2;
  /** World-blended normal at the anchor (single direction; uses averaged tangent at interior anchors). */
  readonly normal: Vec2;
};

/**
 * Returns the anchor / tangent / world-blended-normal data for spline0,
 * for debug visualization. Pure function; no DOM.
 */
export function ribbonDebugSpline0(
  stroke: Stroke,
  style: StyleSettings,
): Spline0DebugAnchor[] {
  if (stroke.vertices.length < 2) return [];
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return [];
  const world = resolveWorldWidth(style);
  const out: Spline0DebugAnchor[] = [];
  for (let i = 0; i < stroke.vertices.length; i++) {
    const v = stroke.vertices[i]!;
    const isFirst = i === 0;
    const isLast = i === stroke.vertices.length - 1;
    const tangentOut = !isLast ? unitOrZero(tangentAt(segments[i]!, 0)) : { x: 0, y: 0 };
    const tangentIn = !isFirst ? unitOrZero(tangentAt(segments[i - 1]!, 1)) : { x: 0, y: 0 };
    let avg: Vec2;
    if (isFirst) avg = tangentOut;
    else if (isLast) avg = tangentIn;
    else avg = unitOrZero({ x: tangentIn.x + tangentOut.x, y: tangentIn.y + tangentOut.y });
    // Default base normal at the anchor + per-vertex override frame.
    const dnx = -avg.y;
    const dny = avg.x;
    // Use a representative bare half so factor doesn't influence direction
    // (debug visualizer only needs the direction here).
    const frame = vertexFrameAt(v, avg, 1);
    let baseN: Vec2;
    if (frame.deltaAngle === 0) {
      baseN = { x: dnx, y: dny };
    } else {
      const c = Math.cos(frame.deltaAngle);
      const s = Math.sin(frame.deltaAngle);
      baseN = { x: dnx * c - dny * s, y: dnx * s + dny * c };
    }
    const normal = blendedNormal(baseN, world);
    out.push({ p: v.p, tangentIn, tangentOut, normal });
  }
  return out;
}

/** One sample on spline1 with its tangent, world-blended normal, and half-width. */
export type Spline1DebugSample = {
  readonly p: Vec2;
  readonly tangent: Vec2;
  /** World-blended normal (pure local function of tangent + world). */
  readonly normal: Vec2;
  readonly half: number;
};

/**
 * Returns the full row of spline1 samples (the subdivided spine) used by
 * the ribbon triangulator: every anchor + `spineSubdiv` interior vertices
 * per segment, each with its tangent, world-blended normal, and
 * (contracted) half-width. Pure function; no DOM.
 */
export function ribbonDebugSpline1(
  stroke: Stroke,
  style: StyleSettings,
  spineSubdiv: number,
  widthMod?: WidthMod | null,
  brokenAnchorSubdiv: number = 0,
  spineLengthAware: boolean = false,
  referenceLength?: number,
): Spline1DebugSample[] {
  if (stroke.vertices.length < 2) return [];
  const segments = strokeToSegments(stroke);
  if (segments.length === 0) return [];
  const profile = stroke.width ?? style.defaultWidth;
  const world = resolveWorldWidth(style);
  const breakFlags = stroke.vertices.map((v) => v.breakTangent === true);
  const spine = buildSpine1(
    segments,
    stroke.vertices,
    Math.max(0, Math.floor(spineSubdiv)),
    profile,
    widthMod ?? null,
    world,
    breakFlags,
    Math.max(0, Math.floor(brokenAnchorSubdiv)),
    spineLengthAware,
    referenceLength,
  );
  return spine.map((v) => ({
    p: v.p,
    tangent: v.tangent,
    normal: v.normal,
    half: v.half,
  }));
}
