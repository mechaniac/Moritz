import type { Vec2 } from './types.js';

export type GlyphSplineVertex = {
  readonly p: Vec2;
  readonly inHandle: Vec2;
  readonly outHandle: Vec2;
  readonly breakTangent?: boolean;
  readonly normalOverride?: Vec2;
};

export type GlyphSplineStroke = {
  readonly id: string;
  readonly vertices: readonly GlyphSplineVertex[];
};

export type Glyph2d = {
  readonly char: string;
  readonly box: { readonly w: number; readonly h: number };
  readonly strokes: readonly GlyphSplineStroke[];
  readonly sidebearings?: { readonly left: number; readonly right: number };
  readonly baselineOffset?: number;
};

export type GlyphCubicSegment2d = {
  readonly p0: Vec2;
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly p1: Vec2;
};

export type Affine2d = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e?: number;
  readonly f?: number;
  readonly tx?: number;
  readonly ty?: number;
};

export type GlyphSymbol2d = {
  readonly id: string;
  readonly offset?: number;
};

export type GlyphSymbolFrame2d = {
  readonly id: string;
  readonly index: number;
  readonly symbol: GlyphSymbol2d;
  readonly p: Vec2;
  readonly tangent: Vec2;
  readonly angle: number;
  readonly tArc: number;
  readonly visible: boolean;
};

export type GlyphSymbolAnimation2d = {
  readonly frames: readonly GlyphSymbolFrame2d[];
};

export type GlyphSymbolAnimationOptions2d = {
  readonly symbols: readonly GlyphSymbol2d[];
  readonly samplesPerSegment?: number;
  readonly phase?: number;
  readonly time?: number;
  readonly speed?: number;
  readonly direction?: 'forward' | 'reverse' | 'alternate' | 1 | -1;
  readonly spacing?: number;
  readonly loop?: boolean;
  readonly easing?: 'linear' | 'smoothstep' | 'ease-in' | 'ease-out' | 'ease-in-out';
};

export type SimplePolygonMesh2d = {
  readonly points: readonly Vec2[];
  readonly triangles: readonly (readonly [number, number, number])[];
  readonly sourceIndices: readonly number[];
};

export function glyphVertexPairToSegment(
  a: GlyphSplineVertex,
  b: GlyphSplineVertex,
): GlyphCubicSegment2d {
  return {
    p0: a.p,
    c1: add(a.p, a.outHandle),
    c2: add(b.p, b.inHandle),
    p1: b.p,
  };
}

export function glyphStrokeToSegments(stroke: GlyphSplineStroke): GlyphCubicSegment2d[] {
  const out: GlyphCubicSegment2d[] = [];
  for (let i = 0; i < stroke.vertices.length - 1; i++) {
    out.push(glyphVertexPairToSegment(stroke.vertices[i]!, stroke.vertices[i + 1]!));
  }
  return out;
}

export function evalGlyphCubicSegment(seg: GlyphCubicSegment2d, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * seg.p0.x + 3 * uu * t * seg.c1.x + 3 * u * tt * seg.c2.x + ttt * seg.p1.x,
    y: uuu * seg.p0.y + 3 * uu * t * seg.c1.y + 3 * u * tt * seg.c2.y + ttt * seg.p1.y,
  };
}

export function unitTangentGlyphCubicSegment(seg: GlyphCubicSegment2d, t: number): Vec2 {
  const u = 1 - t;
  const dx =
    3 * u * u * (seg.c1.x - seg.p0.x) +
    6 * u * t * (seg.c2.x - seg.c1.x) +
    3 * t * t * (seg.p1.x - seg.c2.x);
  const dy =
    3 * u * u * (seg.c1.y - seg.p0.y) +
    6 * u * t * (seg.c2.y - seg.c1.y) +
    3 * t * t * (seg.p1.y - seg.c2.y);
  return normalizeWithFallback({ x: dx, y: dy }, sub(seg.p1, seg.p0));
}

export function affineFromGlyphStyle2d(
  style: { readonly slant: number; readonly scaleX: number; readonly scaleY: number },
  slantPivotY = 0,
): Affine2d {
  const shear = Math.tan(style.slant) * style.scaleY;
  return {
    a: style.scaleX,
    b: 0,
    c: shear,
    d: style.scaleY,
    e: -shear * slantPivotY,
    f: 0,
  };
}

export function transformPoint2d(m: Affine2d, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + affineTx(m),
    y: m.b * p.x + m.d * p.y + affineTy(m),
  };
}

export function transformVector2d(m: Affine2d, v: Vec2): Vec2 {
  return {
    x: m.a * v.x + m.c * v.y,
    y: m.b * v.x + m.d * v.y,
  };
}

export function transformGlyphVertex2d<T extends GlyphSplineVertex>(
  m: Affine2d,
  vertex: T,
): T {
  return {
    ...vertex,
    p: transformPoint2d(m, vertex.p),
    inHandle: transformVector2d(m, vertex.inHandle),
    outHandle: transformVector2d(m, vertex.outHandle),
    ...(vertex.normalOverride
      ? { normalOverride: transformNormalOverride(m, vertex.normalOverride) }
      : {}),
  };
}

export function transformGlyphStroke2d<T extends GlyphSplineStroke>(
  m: Affine2d,
  stroke: T,
): T {
  return {
    ...stroke,
    vertices: stroke.vertices.map((vertex) => transformGlyphVertex2d(m, vertex)),
  };
}

export function transformGlyph2d<T extends Glyph2d>(
  glyph: T,
  style: { readonly slant: number; readonly scaleX: number; readonly scaleY: number },
): T {
  const m = affineFromGlyphStyle2d(style, glyph.box.h / 2);
  return {
    ...glyph,
    box: {
      w: glyph.box.w * style.scaleX,
      h: glyph.box.h * style.scaleY,
    },
    strokes: glyph.strokes.map((stroke) => transformGlyphStroke2d(m, stroke)),
  };
}

export function animateGlyphSymbolsAlongStroke2d(
  stroke: GlyphSplineStroke,
  options: GlyphSymbolAnimationOptions2d,
): GlyphSymbolAnimation2d {
  const symbols = options.symbols;
  if (symbols.length === 0 || stroke.vertices.length < 2) return { frames: [] };

  const segments = glyphStrokeToSegments(stroke);
  const lengthSamples = Math.max(4, options.samplesPerSegment ?? 24);
  const lengths = segments.map((seg) => approxSegmentLength(seg, lengthSamples));
  const total = lengths.reduce((sum, len) => sum + len, 0) || 1;
  const spacing = options.spacing ?? (symbols.length > 1 ? 1 / (symbols.length - 1) : 0);
  const phase = options.phase ?? 0;
  const speed = options.speed ?? 0;
  const time = options.time ?? 0;
  const direction = options.direction ?? 'forward';
  const directionSign = direction === 'reverse' || direction === -1 ? -1 : 1;
  const travel = directionSign * time * speed;

  const frames = symbols.map((symbol, index): GlyphSymbolFrame2d => {
    const raw = symbols.length === 1
      ? phase + travel + (symbol.offset ?? 0)
      : phase + travel + index * spacing + (symbol.offset ?? 0);
    const eased = ease(options.easing ?? 'linear', options.loop === false ? clamp01(raw) : wrap01(raw));
    const tArc = options.loop === false ? eased : wrap01(eased);
    const sample = sampleAtArc(segments, lengths, total, tArc);
    return {
      id: symbol.id,
      index,
      symbol,
      tArc,
      p: sample.p,
      tangent: sample.tangent,
      angle: Math.atan2(sample.tangent.y, sample.tangent.x),
      visible: options.loop === false ? raw >= 0 && raw <= 1 : true,
    };
  });
  return { frames };
}

export function triangulateSimplePolygonMesh2d(poly: readonly Vec2[]): SimplePolygonMesh2d {
  if (poly.length < 3) {
    return { points: poly, triangles: [], sourceIndices: poly.map((_, i) => i) };
  }
  assertSimplePolygon(poly);
  const area = signedArea(poly);
  if (Math.abs(area) < 1e-9) throw new Error('Cannot triangulate a zero-area polygon.');

  const sourceIndices = poly.map((_, i) => i);
  if (area < 0) sourceIndices.reverse();
  const points = sourceIndices.map((i) => poly[i]!);
  const remaining = points.map((_, i) => i);
  const triangles: [number, number, number][] = [];
  let guard = 0;

  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length]!;
      const cur = remaining[i]!;
      const next = remaining[(i + 1) % remaining.length]!;
      if (!isConvex(points[prev]!, points[cur]!, points[next]!)) continue;
      if (containsAnyPoint(points, remaining, prev, cur, next)) continue;
      triangles.push([prev, cur, next]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    guard++;
    if (!clipped || guard > poly.length * poly.length) {
      throw new Error('Could not find an ear in polygon.');
    }
  }

  triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  return { points, triangles, sourceIndices };
}

function sampleAtArc(
  segments: readonly GlyphCubicSegment2d[],
  lengths: readonly number[],
  total: number,
  tArc: number,
): { readonly p: Vec2; readonly tangent: Vec2 } {
  const target = clamp01(tArc) * total;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = lengths[i]!;
    if (target <= acc + len || i === segments.length - 1) {
      const seg = segments[i]!;
      if (isStraightSegment(seg)) {
        const localArc = len > 1e-9 ? clamp01((target - acc) / len) : tArc;
        return {
          p: lerp(seg.p0, seg.p1, localArc),
          tangent: unitTangentGlyphCubicSegment(seg, localArc),
        };
      }
      const localT = len > 1e-9
        ? tForArcLength(seg, target - acc, len)
        : tArc;
      return {
        p: evalGlyphCubicSegment(seg, clamp01(localT)),
        tangent: unitTangentGlyphCubicSegment(seg, clamp01(localT)),
      };
    }
    acc += len;
  }
  const last = segments[segments.length - 1]!;
  return { p: last.p1, tangent: unitTangentGlyphCubicSegment(last, 1) };
}

function approxSegmentLength(seg: GlyphCubicSegment2d, samples = 24): number {
  let length = 0;
  let prev = seg.p0;
  for (let i = 1; i <= samples; i++) {
    const p = evalGlyphCubicSegment(seg, i / samples);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

function tForArcLength(seg: GlyphCubicSegment2d, targetLength: number, totalLength: number): number {
  const target = Math.min(totalLength, Math.max(0, targetLength));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (partialSegmentLength(seg, mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function partialSegmentLength(seg: GlyphCubicSegment2d, tMax: number, samples = 16): number {
  const tEnd = clamp01(tMax);
  if (tEnd <= 0) return 0;
  let length = 0;
  let prev = seg.p0;
  for (let i = 1; i <= samples; i++) {
    const p = evalGlyphCubicSegment(seg, (i / samples) * tEnd);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

function isStraightSegment(seg: GlyphCubicSegment2d): boolean {
  const chord = sub(seg.p1, seg.p0);
  const chordLen = Math.hypot(chord.x, chord.y);
  if (chordLen <= 1e-9) return false;
  const c1 = Math.abs(cross(chord, sub(seg.c1, seg.p0))) / chordLen;
  const c2 = Math.abs(cross(chord, sub(seg.c2, seg.p0))) / chordLen;
  return c1 < 1e-7 && c2 < 1e-7;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function assertSimplePolygon(poly: readonly Vec2[]): void {
  for (let i = 0; i < poly.length; i++) {
    const a0 = poly[i]!;
    const a1 = poly[(i + 1) % poly.length]!;
    for (let j = i + 1; j < poly.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === poly.length - 1) continue;
      const b0 = poly[j]!;
      const b1 = poly[(j + 1) % poly.length]!;
      if (segmentsIntersect(a0, a1, b0, b1)) {
        throw new Error('Cannot triangulate a self-intersecting polygon.');
      }
    }
  }
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (Math.abs(o1) < 1e-9 && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < 1e-9 && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < 1e-9 && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < 1e-9 && onSegment(c, b, d)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function onSegment(a: Vec2, p: Vec2, b: Vec2): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return cross(sub(b, a), sub(c, a));
}

function signedArea(poly: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function isConvex(a: Vec2, b: Vec2, c: Vec2): boolean {
  return cross(sub(b, a), sub(c, b)) > 1e-9;
}

function containsAnyPoint(
  points: readonly Vec2[],
  remaining: readonly number[],
  a: number,
  b: number,
  c: number,
): boolean {
  for (const idx of remaining) {
    if (idx === a || idx === b || idx === c) continue;
    if (pointInTriangle(points[idx]!, points[a]!, points[b]!, points[c]!)) return true;
  }
  return false;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const ab = cross(sub(b, a), sub(p, a));
  const bc = cross(sub(c, b), sub(p, b));
  const ca = cross(sub(a, c), sub(p, c));
  return ab >= -1e-9 && bc >= -1e-9 && ca >= -1e-9;
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Transform a normalOverride vector through an affine. Preserves the original
 * magnitude (which encodes per-anchor half-width) while rotating the direction
 * through the affine's linear part. Without this, the half-width information
 * is lost and the stroke always renders thin.
 */
function transformNormalOverride(m: Affine2d, ov: Vec2): Vec2 {
  const originalLen = Math.hypot(ov.x, ov.y);
  if (originalLen <= 1e-9) return ov;
  const transformed = transformVector2d(m, ov);
  const transformedLen = Math.hypot(transformed.x, transformed.y);
  if (transformedLen <= 1e-9) return ov;
  // Re-scale to preserve the original magnitude
  const scale = originalLen / transformedLen;
  return { x: transformed.x * scale, y: transformed.y * scale };
}

function normalizeWithFallback(v: Vec2, fallback: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len > 1e-9) return { x: v.x / len, y: v.y / len };
  const fallbackLen = Math.hypot(fallback.x, fallback.y);
  if (fallbackLen > 1e-9) return { x: fallback.x / fallbackLen, y: fallback.y / fallbackLen };
  return { x: 1, y: 0 };
}

function affineTx(m: Affine2d): number {
  return m.e ?? m.tx ?? 0;
}

function affineTy(m: Affine2d): number {
  return m.f ?? m.ty ?? 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function ease(kind: NonNullable<GlyphSymbolAnimationOptions2d['easing']>, t: number): number {
  switch (kind) {
    case 'smoothstep':
    case 'ease-in-out':
      return t * t * (3 - 2 * t);
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    default:
      return t;
  }
}
