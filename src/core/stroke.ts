/**
 * Variable-width stroke outlining.
 *
 * Pipeline per stroke:
 *   1. Build cubic segments from vertices.
 *   2. Sample the chain into points with tangents and arc-position tArc.
 *   3. At each sample compute the half-width from the WidthProfile (linear
 *      interpolation between the two enclosing samples).
 *   4. Compute the offset normal:
 *        - 'tangent' orientation: rotate the tangent 90° (left/right normals).
 *        - 'world'   orientation: a fixed world-space direction; the half-width
 *          is laid down along that direction regardless of the path.
 *   5. Emit two offset polylines (left, right), reverse one and concatenate
 *      to form a closed polygon. Caps are added at start/end.
 *
 * Output: a single closed polygon as a flat array of Vec2. The first and last
 * point are NOT identical; the renderer should close the path.
 */

import {
  sampleStroke,
  strokeToSegments,
  type StrokeSample,
} from './bezier.js';
import type {
  CapShape,
  Stroke,
  StyleSettings,
  Vec2,
  WidthProfile,
} from './types.js';

const SAMPLES_PER_SEGMENT = 24;

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

/** Compute per-sample (left, right) offset points. */
function offsetPair(
  sample: StrokeSample,
  halfWidth: number,
  worldNormal: Vec2 | null,
): { left: Vec2; right: Vec2 } {
  // Default: rotate tangent 90° CCW for the left normal.
  const n =
    worldNormal ??
    ({ x: -sample.tangent.y, y: sample.tangent.x } satisfies Vec2);
  return {
    left: { x: sample.p.x + n.x * halfWidth, y: sample.p.y + n.y * halfWidth },
    right: { x: sample.p.x - n.x * halfWidth, y: sample.p.y - n.y * halfWidth },
  };
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
  /** Left side polyline (in path direction), `samples` points. */
  readonly left: readonly Vec2[];
  /** Right side polyline (in path direction), `samples` points. */
  readonly right: readonly Vec2[];
  /** Cap polyline at the start of the stroke (right[0] → left[0]). */
  readonly startCap: readonly Vec2[];
  /** Cap polyline at the end of the stroke (left[last] → right[last]). */
  readonly endCap: readonly Vec2[];
};

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
  if (stroke.vertices.length < 2) return empty;

  const segments = strokeToSegments(stroke);
  const samples = sampleStroke(segments, SAMPLES_PER_SEGMENT);
  if (samples.length < 2) return empty;

  const profile = stroke.width ?? style.defaultWidth;
  const worldNormal: Vec2 | null =
    style.widthOrientation === 'world'
      ? { x: -Math.sin(style.worldAngle), y: Math.cos(style.worldAngle) }
      : null;

  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (const s of samples) {
    const half = widthAt(profile, s.tArc) / 2;
    const { left, right } = offsetPair(s, half, worldNormal);
    lefts.push(left);
    rights.push(right);
  }
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const capStart = stroke.capStart ?? style.capStart;
  const capEnd = stroke.capEnd ?? style.capEnd;
  const endCapPts = buildCap(capEnd, last.p, lefts[lefts.length - 1]!, rights[rights.length - 1]!, last.tangent);
  const startCapPts = buildCap(capStart, first.p, rights[0]!, lefts[0]!, { x: -first.tangent.x, y: -first.tangent.y });

  // Caps include only the interior fan points; flank them with the corner
  // samples so the polyline visibly connects to the side strands.
  const startCap: Vec2[] = [rights[0]!, ...startCapPts, lefts[0]!];
  const endCap: Vec2[] = [
    lefts[lefts.length - 1]!,
    ...endCapPts,
    rights[rights.length - 1]!,
  ];
  return { left: lefts, right: rights, startCap, endCap };
}

/**
 * Outline a single stroke into a closed polygon, given the active style.
 * Stroke-level overrides on `width`, `capStart`, `capEnd` win over the style.
 */
export function outlineStroke(
  stroke: Stroke,
  style: StyleSettings,
): OutlinePolygon {
  if (stroke.vertices.length < 2) return [];

  const segments = strokeToSegments(stroke);
  const samples = sampleStroke(segments, SAMPLES_PER_SEGMENT);
  if (samples.length < 2) return [];

  const profile = stroke.width ?? style.defaultWidth;
  const worldNormal: Vec2 | null =
    style.widthOrientation === 'world'
      ? {
          x: -Math.sin(style.worldAngle),
          y: Math.cos(style.worldAngle),
        }
      : null;

  const lefts: Vec2[] = [];
  const rights: Vec2[] = [];
  for (const s of samples) {
    const half = widthAt(profile, s.tArc) / 2;
    const { left, right } = offsetPair(s, half, worldNormal);
    lefts.push(left);
    rights.push(right);
  }

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const capStart = stroke.capStart ?? style.capStart;
  const capEnd = stroke.capEnd ?? style.capEnd;

  // End cap: from left[last] -> right[last], facing +tangent direction.
  const endCap = buildCap(capEnd, last.p, lefts[lefts.length - 1]!, rights[rights.length - 1]!, last.tangent);
  // Start cap: from right[0] -> left[0], facing -tangent direction.
  const startCap = buildCap(
    capStart,
    first.p,
    rights[0]!,
    lefts[0]!,
    { x: -first.tangent.x, y: -first.tangent.y },
  );

  // Walk left side forward, end cap, right side backward, start cap.
  const polygon: Vec2[] = [];
  polygon.push(...lefts);
  polygon.push(...endCap);
  for (let i = rights.length - 1; i >= 0; i--) polygon.push(rights[i]!);
  polygon.push(...startCap);
  return polygon;
}
