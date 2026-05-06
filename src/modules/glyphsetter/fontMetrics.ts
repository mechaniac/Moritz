/**
 * Measure typographic metrics for a CSS font-family stack, using a hidden
 * canvas. Results are normalised to a 1-em scale so callers can multiply by
 * any pixel size. Memoised per family string because TextMetrics calls are
 * cheap individually but add up under realtime resize.
 *
 * Browser support note: `actualBoundingBoxAscent/Descent` and
 * `fontBoundingBoxAscent/Descent` are widely available in modern Chromium /
 * Firefox / Safari. We fall back to canonical Latin defaults if either is
 * missing or returns 0 (e.g. an unloaded webfont).
 */

export type FontMetricsEm = {
  capHeight: number;   // em, height of 'H' above baseline
  xHeight: number;     // em, height of 'x' above baseline
  ascent: number;      // em, font-wide ascent above baseline
  descent: number;     // em, font-wide descent below baseline
};

const FALLBACK: FontMetricsEm = {
  capHeight: 0.70,
  xHeight: 0.50,
  ascent: 0.80,
  descent: 0.20,
};

const cache = new Map<string, FontMetricsEm>();

let _ctx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  _ctx = c.getContext('2d');
  return _ctx;
}

export function measureFontMetrics(family: string): FontMetricsEm {
  if (!family) return FALLBACK;
  const cached = cache.get(family);
  if (cached) return cached;
  const c = ctx();
  if (!c) return FALLBACK;
  const SIZE = 1000;
  c.font = `${SIZE}px ${family}`;
  c.textBaseline = 'alphabetic';
  const cap = c.measureText('H');
  const xr  = c.measureText('x');
  const cH = (cap.actualBoundingBoxAscent ?? 0) / SIZE;
  const xH = (xr.actualBoundingBoxAscent  ?? 0) / SIZE;
  // Font-wide ascent/descent: prefer fontBoundingBox (font metrics, not
  // glyph-specific). Fallback to actualBoundingBox of an ascender + descender.
  let asc = (cap.fontBoundingBoxAscent ?? 0) / SIZE;
  let desc = (cap.fontBoundingBoxDescent ?? 0) / SIZE;
  if (asc <= 0 || desc <= 0) {
    const tall = c.measureText('lh');
    const low  = c.measureText('gpqy');
    asc = (tall.actualBoundingBoxAscent ?? 0) / SIZE || FALLBACK.ascent;
    desc = (low.actualBoundingBoxDescent ?? 0) / SIZE || FALLBACK.descent;
  }
  const m: FontMetricsEm = {
    capHeight: cH > 0 ? cH : FALLBACK.capHeight,
    xHeight:   xH > 0 ? xH : FALLBACK.xHeight,
    ascent:    asc > 0 ? asc : FALLBACK.ascent,
    descent:   desc > 0 ? desc : FALLBACK.descent,
  };
  cache.set(family, m);
  return m;
}
