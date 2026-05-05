/**
 * Editor guides for the GlyphSetter canvas. Pure data + computation; the
 * SVG render lives in `GlyphSetter.tsx`.
 *
 * Design goals:
 *  - Stackable layers (any number, any order) each toggleable, colorable,
 *    and with its own opacity.
 *  - Coordinates are expressed in glyph units (the same space as `Glyph.box`
 *    and stroke vertices). Renderer multiplies by SCALE.
 *  - Each preset reflects a real lettering / typography convention so they
 *    can be combined meaningfully (cap height + x-height + baseline +
 *    descender; or golden-ratio frame + diagonals; or italic slant grid).
 *
 * Geometry is emitted as `Line` primitives (point + direction) so they can
 * be clipped to the glyph box at render time. This keeps the data model
 * coordinate-agnostic — a slant-line layer doesn't need to know the glyph
 * box dimensions to be defined.
 */

export type GuideKind =
  // Uniform vertical / horizontal subdivisions (n-1 internal lines).
  | { kind: 'subdivisions'; axis: 'x' | 'y'; n: number }
  // Golden ratio splits (recursive, depth N). axis = which axis to split on.
  | { kind: 'golden'; axis: 'x' | 'y'; depth: number }
  // Box diagonals / cross-diagonals (4 lines per repetition).
  | { kind: 'diagonals'; cross: boolean }
  // Horizontal calligraphy lines: ascender / cap / x-height / baseline /
  // descender. Parameters are aesthetic ratios (not raw y-fractions) so the
  // user can only nudge the typography within tasteful bounds. All values
  // are clamped at compute time to AESTHETIC_RANGES.
  | {
      kind: 'calligraphy';
      capHeight: number;     // cap-height as fraction of box H (range 0.45..0.75)
      xHeight: number;       // x-height as fraction of cap-height (range 0.42..0.65)
      ascender: number;      // extra above cap, fraction of box H (range 0.00..0.18)
      descender: number;     // depth below baseline, fraction of box H (range 0.10..0.32)
      weight: number;        // vertical bias of the body, fraction of box H (range -0.10..0.10; +down)
    }
  // Italic / slant grid — vertical(ish) lines repeated across the box,
  // each rotated by `angle` (radians, +ve = lean right).
  | { kind: 'slant'; angle: number; spacing: number /* in glyph-x units */ }
  // Concentric circles / rings centered in the box (for round letters).
  | { kind: 'rings'; count: number; innerRatio: number /* 0..1 */ }
  // Dot grid.
  | { kind: 'dots'; spacing: number; radiusUnits: number };

export type GuideLayer = {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly color: string; // CSS color
  readonly opacity: number; // 0..1
  readonly strokeWidth: number; // CSS pixels (renderer divides by SCALE)
  readonly kind: GuideKind;
};

export type GuideSettings = {
  readonly enabled: boolean;
  readonly layers: readonly GuideLayer[];
};

const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_INV = 1 / PHI; // ≈ 0.618...

let _id = 0;
const newId = (): string => `guide_${(++_id).toString(36)}`;

/* ---------- presets ------------------------------------------------------ */

export function presetSubdivisions(n: number, axis: 'x' | 'y' = 'x'): GuideLayer {
  return {
    id: newId(),
    label: `${axis === 'x' ? 'Cols' : 'Rows'} × ${n}`,
    visible: true,
    color: '#3a86ff',
    opacity: 0.18,
    strokeWidth: 1,
    kind: { kind: 'subdivisions', axis, n },
  };
}

export function presetGolden(axis: 'x' | 'y' = 'x', depth = 3): GuideLayer {
  return {
    id: newId(),
    label: `Golden φ (${axis}, depth ${depth})`,
    visible: true,
    color: '#d4a017',
    opacity: 0.28,
    strokeWidth: 1,
    kind: { kind: 'golden', axis, depth },
  };
}

export function presetDiagonals(cross = true): GuideLayer {
  return {
    id: newId(),
    label: cross ? 'Diagonals ×' : 'Diagonal ╲',
    visible: true,
    color: '#9b5de5',
    opacity: 0.18,
    strokeWidth: 1,
    kind: { kind: 'diagonals', cross },
  };
}

/**
 * Aesthetic bounds for the calligraphy kind. The UI uses these to set slider
 * ranges; the compute stage clamps to them so out-of-band JSON imports still
 * render sanely.
 */
export const CALLIGRAPHY_RANGES = {
  capHeight: { min: 0.45, max: 0.75, default: 0.62 },
  xHeight:   { min: 0.42, max: 0.65, default: 0.52 },
  ascender:  { min: 0.00, max: 0.18, default: 0.06 },
  descender: { min: 0.10, max: 0.32, default: 0.22 },
  weight:    { min: -0.10, max: 0.10, default: 0.00 },
} as const;

function clampRange(v: number, r: { min: number; max: number }): number {
  return Math.max(r.min, Math.min(r.max, v));
}

export function presetCalligraphy(): GuideLayer {
  return {
    id: newId(),
    label: 'Calligraphy lines',
    visible: true,
    color: '#ef476f',
    opacity: 0.55,
    strokeWidth: 1.25,
    kind: {
      kind: 'calligraphy',
      capHeight: CALLIGRAPHY_RANGES.capHeight.default,
      xHeight:   CALLIGRAPHY_RANGES.xHeight.default,
      ascender:  CALLIGRAPHY_RANGES.ascender.default,
      descender: CALLIGRAPHY_RANGES.descender.default,
      weight:    CALLIGRAPHY_RANGES.weight.default,
    },
  };
}

export function presetSlant(angleDeg = 12, spacing = 10): GuideLayer {
  return {
    id: newId(),
    label: `Slant ${angleDeg}° / ${spacing}u`,
    visible: true,
    color: '#06a77d',
    opacity: 0.22,
    strokeWidth: 1,
    kind: { kind: 'slant', angle: (angleDeg * Math.PI) / 180, spacing },
  };
}

export function presetRings(count = 4, innerRatio = 0.2): GuideLayer {
  return {
    id: newId(),
    label: `Rings × ${count}`,
    visible: true,
    color: '#4361ee',
    opacity: 0.22,
    strokeWidth: 1,
    kind: { kind: 'rings', count, innerRatio },
  };
}

export function presetDots(spacing = 10, radius = 0.5): GuideLayer {
  return {
    id: newId(),
    label: `Dots / ${spacing}u`,
    visible: true,
    color: '#444',
    opacity: 0.35,
    strokeWidth: 0,
    kind: { kind: 'dots', spacing, radiusUnits: radius },
  };
}

/** Default seed: a calligraphy frame + golden split + 8-col grid. */
export function defaultGuides(): GuideSettings {
  return {
    enabled: true,
    layers: [
      presetCalligraphy(),
      presetGolden('x', 2),
      presetSubdivisions(8, 'x'),
    ],
  };
}

/* ---------- geometry helpers (pure) -------------------------------------- */

export type GuideLine = { x1: number; y1: number; x2: number; y2: number };
export type GuideCircle = { cx: number; cy: number; r: number };
export type GuideDot = { cx: number; cy: number; r: number };

export type GuideGeometry = {
  readonly lines: readonly GuideLine[];
  readonly circles: readonly GuideCircle[];
  readonly dots: readonly GuideDot[];
};

const empty: GuideGeometry = { lines: [], circles: [], dots: [] };

/**
 * Compute the full geometry for one layer in glyph-unit space, clipped to
 * the box `[0,W] × [0,H]`. Pure: same inputs always produce same outputs.
 */
export function computeLayerGeometry(
  layer: GuideLayer,
  W: number,
  H: number,
): GuideGeometry {
  const k = layer.kind;
  switch (k.kind) {
    case 'subdivisions': {
      const lines: GuideLine[] = [];
      const n = Math.max(1, k.n | 0);
      for (let i = 1; i < n; i++) {
        if (k.axis === 'x') {
          const x = (i / n) * W;
          lines.push({ x1: x, y1: 0, x2: x, y2: H });
        } else {
          const y = (i / n) * H;
          lines.push({ x1: 0, y1: y, x2: W, y2: y });
        }
      }
      return { lines, circles: [], dots: [] };
    }
    case 'golden': {
      // Recursive golden split: at each depth, split the current box on
      // `axis` at PHI_INV from the LEFT/TOP, then recurse into the LARGER
      // child on the perpendicular axis (classic golden spiral subdivision).
      const lines: GuideLine[] = [];
      const depth = Math.max(1, k.depth | 0);
      let x0 = 0, y0 = 0, w = W, h = H;
      let axis: 'x' | 'y' = k.axis;
      for (let d = 0; d < depth; d++) {
        if (axis === 'x') {
          const x = x0 + w * PHI_INV;
          lines.push({ x1: x, y1: y0, x2: x, y2: y0 + h });
          // Larger child is the LEFT one (PHI_INV ≈ 0.618). Recurse there.
          w = w * PHI_INV;
          axis = 'y';
        } else {
          const y = y0 + h * PHI_INV;
          lines.push({ x1: x0, y1: y, x2: x0 + w, y2: y });
          h = h * PHI_INV;
          axis = 'x';
        }
      }
      return { lines, circles: [], dots: [] };
    }
    case 'diagonals': {
      const lines: GuideLine[] = [
        { x1: 0, y1: 0, x2: W, y2: H },
      ];
      if (k.cross) lines.push({ x1: 0, y1: H, x2: W, y2: 0 });
      return { lines, circles: [], dots: [] };
    }
    case 'calligraphy': {
      // Clamp inputs to aesthetic ranges, then derive the five y positions.
      // Layout (top -> bottom in y-from-top coordinates):
      //   ascender_y  = baseline_y - capHeight - ascender
      //   cap_y       = baseline_y - capHeight
      //   xHeight_y   = baseline_y - xHeight * capHeight
      //   baseline_y  = (1 - descender + weight)
      //   descender_y = baseline_y + descender
      // The body is centered with no padding by default; `weight` shifts it.
      const cap  = clampRange(k.capHeight, CALLIGRAPHY_RANGES.capHeight);
      const xr   = clampRange(k.xHeight,   CALLIGRAPHY_RANGES.xHeight);
      const asc  = clampRange(k.ascender,  CALLIGRAPHY_RANGES.ascender);
      const desc = clampRange(k.descender, CALLIGRAPHY_RANGES.descender);
      const w    = clampRange(k.weight,    CALLIGRAPHY_RANGES.weight);
      // Ensure ascender_y stays within [0, H]. Min top-margin: 0.
      const total = asc + cap + desc; // body span as fraction of H
      // Place baseline so ascender_y >= 0 and descender_y <= 1, then bias by w.
      const minBaseline = asc + cap;            // descender_y could overflow but desc clamped
      const maxBaseline = 1 - desc;
      const naturalBaseline = (1 - total) * 0.5 + asc + cap; // centered
      const baseline = Math.max(minBaseline, Math.min(maxBaseline, naturalBaseline + w));
      const ascY = (baseline - cap - asc) * H;
      const capY = (baseline - cap) * H;
      const xY  = (baseline - xr * cap) * H;
      const baseY = baseline * H;
      const descY = (baseline + desc) * H;
      const lines: GuideLine[] = [];
      for (const y of [ascY, capY, xY, baseY, descY]) {
        lines.push({ x1: 0, y1: y, x2: W, y2: y });
      }
      return { lines, circles: [], dots: [] };
    }
    case 'slant': {
      // Slanted lines spaced `spacing` apart on the BASELINE (y=H), then
      // tilted by `angle` (positive => leans right at the top).
      const lines: GuideLine[] = [];
      const spacing = Math.max(0.5, k.spacing);
      const dx = Math.tan(k.angle) * H; // horizontal offset from bottom to top
      // We want lines that intersect the box; start from x = -|dx| and go
      // until W + |dx| at the bottom.
      const start = Math.floor(-Math.abs(dx) / spacing) * spacing;
      const end = W + Math.abs(dx);
      for (let xb = start; xb <= end; xb += spacing) {
        const xt = xb + dx;
        lines.push({ x1: xt, y1: 0, x2: xb, y2: H });
      }
      // Clip to the box by parameter (cheap: keep the visual segment from
      // first to last in-box pixel via a quick liang-barsky-ish clip).
      const clipped = lines
        .map((l) => clipLineToBox(l, W, H))
        .filter((l): l is GuideLine => l !== null);
      return { lines: clipped, circles: [], dots: [] };
    }
    case 'rings': {
      const cx = W / 2;
      const cy = H / 2;
      const rMax = Math.min(W, H) / 2;
      const rMin = rMax * Math.max(0, Math.min(1, k.innerRatio));
      const circles: GuideCircle[] = [];
      const count = Math.max(1, k.count | 0);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 1 : i / (count - 1);
        circles.push({ cx, cy, r: rMin + (rMax - rMin) * t });
      }
      return { lines: [], circles, dots: [] };
    }
    case 'dots': {
      const dots: GuideDot[] = [];
      const sp = Math.max(0.5, k.spacing);
      const r = Math.max(0.05, k.radiusUnits);
      for (let y = sp / 2; y < H; y += sp) {
        for (let x = sp / 2; x < W; x += sp) {
          dots.push({ cx: x, cy: y, r });
        }
      }
      return { lines: [], circles: [], dots };
    }
    default: {
      // Exhaustiveness guard.
      const _exh: never = k;
      void _exh;
      return empty;
    }
  }
}

/**
 * Liang–Barsky line clipping against [0,W] × [0,H]. Returns the clipped
 * line, or null if it lies entirely outside.
 */
function clipLineToBox(line: GuideLine, W: number, H: number): GuideLine | null {
  let t0 = 0;
  let t1 = 1;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [line.x1 - 0, W - line.x1, line.y1 - 0, H - line.y1];
  for (let i = 0; i < 4; i++) {
    if (p[i]! === 0) {
      if (q[i]! < 0) return null;
      continue;
    }
    const r = q[i]! / p[i]!;
    if (p[i]! < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return {
    x1: line.x1 + t0 * dx,
    y1: line.y1 + t0 * dy,
    x2: line.x1 + t1 * dx,
    y2: line.y1 + t1 * dy,
  };
}

/* ---------- mutation helpers (immutable) --------------------------------- */

export function addLayer(s: GuideSettings, layer: GuideLayer): GuideSettings {
  return { ...s, layers: [...s.layers, layer] };
}
export function removeLayer(s: GuideSettings, id: string): GuideSettings {
  return { ...s, layers: s.layers.filter((l) => l.id !== id) };
}
export function updateLayer(
  s: GuideSettings,
  id: string,
  patch: Partial<GuideLayer>,
): GuideSettings {
  return {
    ...s,
    layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  };
}
export function moveLayer(s: GuideSettings, id: string, dir: -1 | 1): GuideSettings {
  const i = s.layers.findIndex((l) => l.id === id);
  if (i < 0) return s;
  const j = i + dir;
  if (j < 0 || j >= s.layers.length) return s;
  const arr = s.layers.slice();
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it!);
  return { ...s, layers: arr };
}
