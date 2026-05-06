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
  // Golden ratio: depth N nested golden rectangles. By default the renderer
  // draws the spiral (quarter-arc per square); setting `splits` adds the
  // dividing lines. The whole layer can be rotated, translated, and scaled
  // around the box centre — useful when fitting the spiral to a particular
  // glyph silhouette. `axis` is kept for migration compatibility.
  | {
      kind: 'golden';
      depth: number;
      axis?: 'x' | 'y';
      spiral?: boolean;       // default true
      splits?: boolean;       // default false
      rotation?: number;      // radians; default 0
      offsetX?: number;       // glyph units; default 0
      offsetY?: number;       // glyph units; default 0
      scale?: number;         // 1.0 = fits in box; default 1
    }
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

export function presetGolden(axis: 'x' | 'y' = 'x', depth = 5): GuideLayer {
  return {
    id: newId(),
    label: `Golden spiral (depth ${depth})`,
    visible: true,
    color: '#d4a017',
    opacity: 0.55,
    strokeWidth: 1.25,
    kind: {
      kind: 'golden',
      depth,
      axis,
      spiral: true,
      splits: false,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
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
/** SVG endpoint-arc parameters (rx == ry for our quarter-circles, so no
 *  xAxisRotation is needed). */
export type GuideArc = {
  x1: number; y1: number;
  x2: number; y2: number;
  rx: number; ry: number;
  largeArc: 0 | 1;
  sweep: 0 | 1;
};

export type GuideGeometry = {
  readonly lines: readonly GuideLine[];
  readonly circles: readonly GuideCircle[];
  readonly dots: readonly GuideDot[];
  readonly arcs: readonly GuideArc[];
};

const empty: GuideGeometry = { lines: [], circles: [], dots: [], arcs: [] };

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
      return { lines, circles: [], dots: [], arcs: [] };
    }
    case 'golden': {
      // Inscribe a φ:1 golden rectangle in the box (longer side fits with a 5% margin),
      // then peel a square per depth step. Each square hosts a quarter-arc — together
      // they form the golden spiral. The whole layer can be rotated, offset, and
      // scaled around the box centre.
      const depth = Math.max(1, k.depth | 0);
      const showSpiral = k.spiral ?? true;
      const showSplits = k.splits ?? false;
      const rot = k.rotation ?? 0;
      const ox = k.offsetX ?? 0;
      const oy = k.offsetY ?? 0;
      const sc = Math.max(0.05, k.scale ?? 1);

      // Fit a golden rectangle inside the box. Choose orientation that gives the
      // largest possible longer side.
      const longerLandscape = Math.min(W, H * PHI);
      const longerPortrait = Math.min(H, W * PHI);
      const landscape = longerLandscape >= longerPortrait;
      const longer = (landscape ? longerLandscape : longerPortrait) * sc * 0.95;
      const shorter = longer / PHI;
      let cw = landscape ? longer : shorter;
      let ch = landscape ? shorter : longer;
      let cx0 = -cw / 2;
      let cy0 = -ch / 2;

      const rawLines: GuideLine[] = [];
      const rawArcs: GuideArc[] = [];
      if (showSplits) {
        // outer rectangle
        rawLines.push(
          { x1: cx0, y1: cy0, x2: cx0 + cw, y2: cy0 },
          { x1: cx0 + cw, y1: cy0, x2: cx0 + cw, y2: cy0 + ch },
          { x1: cx0 + cw, y1: cy0 + ch, x2: cx0, y2: cy0 + ch },
          { x1: cx0, y1: cy0 + ch, x2: cx0, y2: cy0 },
        );
      }

      // Peel squares CCW: 0 = peel left, 1 = peel top, 2 = peel right, 3 = peel bottom.
      let dir = 0;
      for (let i = 0; i < depth; i++) {
        const s = Math.min(cw, ch);
        if (s <= 1e-6) break;
        const d = ((dir % 4) + 4) % 4;
        let sx0 = cx0;
        let sy0 = cy0;
        if (d === 0) {
          if (showSplits) rawLines.push({ x1: cx0 + s, y1: cy0, x2: cx0 + s, y2: cy0 + ch });
          cx0 += s;
          cw -= s;
        } else if (d === 1) {
          if (showSplits) rawLines.push({ x1: cx0, y1: cy0 + s, x2: cx0 + cw, y2: cy0 + s });
          cy0 += s;
          ch -= s;
        } else if (d === 2) {
          sx0 = cx0 + cw - s;
          if (showSplits) rawLines.push({ x1: sx0, y1: cy0, x2: sx0, y2: cy0 + ch });
          cw -= s;
        } else {
          sy0 = cy0 + ch - s;
          if (showSplits) rawLines.push({ x1: cx0, y1: sy0, x2: cx0 + cw, y2: sy0 });
          ch -= s;
        }
        if (showSpiral) {
          // Quarter-arc inside the peeled square. The arc connects the two corners
          // adjacent to the side that joins the previous square, sweeping through
          // the corner farthest from the remaining rectangle so successive arcs
          // chain into a continuous spiral.
          let p1x = 0, p1y = 0, p2x = 0, p2y = 0;
          if (d === 0) { p1x = sx0; p1y = sy0; p2x = sx0 + s; p2y = sy0 + s; }
          else if (d === 1) { p1x = sx0 + s; p1y = sy0; p2x = sx0; p2y = sy0 + s; }
          else if (d === 2) { p1x = sx0 + s; p1y = sy0 + s; p2x = sx0; p2y = sy0; }
          else { p1x = sx0; p1y = sy0 + s; p2x = sx0 + s; p2y = sy0; }
          rawArcs.push({ x1: p1x, y1: p1y, x2: p2x, y2: p2y, rx: s, ry: s, largeArc: 0, sweep: 1 });
        }
        dir++;
      }

      // Apply rotation around (0,0) (currently box centre in local space), then
      // translate to actual box centre + user offset. rx == ry so SVG arcs need
      // no xAxisRotation — rotating both endpoints rotates the circle implicitly.
      const cosA = Math.cos(rot);
      const sinA = Math.sin(rot);
      const txC = W / 2 + ox;
      const tyC = H / 2 + oy;
      const tp = (x: number, y: number): { x: number; y: number } => ({
        x: cosA * x - sinA * y + txC,
        y: sinA * x + cosA * y + tyC,
      });

      const lines = rawLines.map((l) => {
        const a = tp(l.x1, l.y1);
        const b = tp(l.x2, l.y2);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      });
      const arcs = rawArcs.map((a) => {
        const p1 = tp(a.x1, a.y1);
        const p2 = tp(a.x2, a.y2);
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rx: a.rx, ry: a.ry, largeArc: a.largeArc, sweep: a.sweep };
      });
      return { lines, circles: [], dots: [], arcs };
    }
    case 'diagonals': {
      const lines: GuideLine[] = [
        { x1: 0, y1: 0, x2: W, y2: H },
      ];
      if (k.cross) lines.push({ x1: 0, y1: H, x2: W, y2: 0 });
      return { lines, circles: [], dots: [], arcs: [] };
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
      return { lines, circles: [], dots: [], arcs: [] };
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
      return { lines: clipped, circles: [], dots: [], arcs: [] };
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
      return { lines: [], circles, dots: [], arcs: [] };
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
      return { lines: [], circles: [], dots, arcs: [] };
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

/* ---------- defaults per kind (used by the 'reset' button) -------------- */

/**
 * Return a fresh `GuideKind` with the same `kind` discriminator and all
 * tunable fields restored to their preset defaults. Used by the per-layer
 * "reset" button so the user can drop a layer back to a sensible baseline
 * without losing its color/opacity/visibility/order.
 */
export function defaultKindFor(kind: GuideKind): GuideKind {
  switch (kind.kind) {
    case 'subdivisions':
      return { kind: 'subdivisions', axis: kind.axis, n: kind.axis === 'x' ? 8 : 4 };
    case 'golden':
      return {
        kind: 'golden',
        depth: 5,
        axis: kind.axis ?? 'x',
        spiral: true,
        splits: false,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      };
    case 'diagonals':
      return { kind: 'diagonals', cross: true };
    case 'calligraphy':
      return {
        kind: 'calligraphy',
        capHeight: CALLIGRAPHY_RANGES.capHeight.default,
        xHeight: CALLIGRAPHY_RANGES.xHeight.default,
        ascender: CALLIGRAPHY_RANGES.ascender.default,
        descender: CALLIGRAPHY_RANGES.descender.default,
        weight: CALLIGRAPHY_RANGES.weight.default,
      };
    case 'slant':
      return { kind: 'slant', angle: (12 * Math.PI) / 180, spacing: 10 };
    case 'rings':
      return { kind: 'rings', count: 4, innerRatio: 0.2 };
    case 'dots':
      return { kind: 'dots', spacing: 10, radiusUnits: 0.5 };
    default: {
      const _exh: never = kind;
      void _exh;
      return kind;
    }
  }
}
