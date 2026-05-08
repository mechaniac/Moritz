/**
 * Render outlined glyphs to an SVG string. Pure function; no DOM.
 *
 * Coordinate system: glyph-space y grows DOWNWARD (typical screen). The SVG
 * uses the same orientation, so no flip is applied here.
 */

import type { LayoutResult } from '../layout.js';
import { effectiveStyleForGlyph, outlineStroke, redistributePolygonEvenly } from '../stroke.js';
import { triangulatePolygon } from '../triangulate.js';
import { triangulateStrokeRibbon } from '../ribbon.js';
import { jitterActive, jitterPolygon, resolveJitterSeed } from '../effects.js';
import { makeWidthMod, type WidthMod } from '../widthEffects.js';
import { segmentLength, strokeToSegments } from '../bezier.js';
import { ribbonCapSubdivOf, ribbonSpineLengthAwareOf, ribbonSpineSubdivOf, type Font, type Stroke, type StyleSettings, type Vec2 } from '../types.js';

export type SvgRenderOptions = {
  readonly fill?: string; // CSS color for glyph polygons. Default 'black'.
  readonly background?: string; // optional bg rect
  readonly padding?: number; // padding around the layout bbox in font units
  readonly scale?: number; // uniform scale applied to the rendered glyphs (default 1)
  /**
   * When true, draw a non-printing debug overlay on top of the glyphs:
   *   - each glyph's advance box (translucent stroked rect)
   *   - the glyph character drawn small in the corner of its box
   *   - left/right side-bearing markers (vertical ticks at the box edges)
   *   - kerning offsets between adjacent glyphs (a labeled colored bar
   *     spanning the [previous-cursor, applied-kern] range; positive
   *     kerns are blue, negative kerns are red)
   * Useful in StyleSetter to inspect spacing without polluting exports.
   */
  readonly debugOverlay?: boolean;
};

function polygonToPathD(points: readonly Vec2[]): string {
  if (points.length === 0) return '';
  const tris = triangulatePolygon(points);
  return trianglesD(points, tris);
}
// Kept for potential reuse by other tools/exporters; silence "unused" check.
void polygonToPathD;

function trianglesD(
  points: readonly Vec2[],
  tris: readonly (readonly [number, number, number])[],
): string {
  if (points.length === 0 || tris.length === 0) return '';
  const parts: string[] = [];
  for (const t of tris) {
    const a = points[t[0]]!;
    const b = points[t[1]]!;
    const c = points[t[2]]!;
    parts.push(`M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)} L ${fmt(c.x)} ${fmt(c.y)} Z`);
  }
  return parts.join(' ');
}

/** Triangulate one stroke using whichever algorithm `style.triMode` selects. */
function triangulateForStyle(
  stroke: Stroke,
  style: StyleSettings,
  widthMod: WidthMod | null,
  referenceLength?: number,
): { polygon: readonly Vec2[]; triangles: readonly (readonly [number, number, number])[] } {
  const mode = style.triMode ?? 'earcut';
  const evenness = style.vertexEvenness ?? 0;
  let polygon: readonly Vec2[];
  let triangles: readonly (readonly [number, number, number])[];
  if (mode === 'ribbon-fixed' || mode === 'ribbon-density') {
    const r = triangulateStrokeRibbon(stroke, style, {
      spineSubdiv: ribbonSpineSubdivOf(style),
      borderSubdiv: style.ribbonBorderSubdiv ?? 0,
      capSubdiv: ribbonCapSubdivOf(style),
      brokenAnchorSubdiv: style.ribbonBrokenAnchorSubdiv ?? 0,
      spineLengthAware: ribbonSpineLengthAwareOf(style),
      referenceLength,
    }, widthMod);
    polygon = r.polygon;
    triangles = r.triangles;
  } else {
    polygon = outlineStroke(stroke, style, widthMod);
    if (evenness > 0 && polygon.length >= 3) {
      polygon = redistributePolygonEvenly(polygon, evenness);
    }
    triangles = triangulatePolygon(polygon);
  }
  // Note: vertex evenness is intentionally not applied in ribbon modes —
  // resampling the perimeter would invalidate the strip indices and force a
  // fall-back to earcut. Ribbon modes use `ribbonSpread` for arc-length
  // uniform sampling instead.
  return { polygon, triangles };
}

function strokeArcLen(stroke: Stroke): number {
  const segs = strokeToSegments(stroke);
  let total = 0;
  for (const s of segs) total += segmentLength(s);
  return total;
}

const fmt = (n: number): string =>
  Number.isFinite(n) ? Number(n.toFixed(3)).toString() : '0';

export function renderLayoutToSvg(
  layoutResult: LayoutResult,
  font: Font,
  opts: SvgRenderOptions = {},
): string {
  const fill = opts.fill ?? 'black';
  const padding = opts.padding ?? 20;
  const scale = opts.scale ?? 1;

  const innerW = layoutResult.width + padding * 2;
  const innerH = layoutResult.height + padding * 2;
  const w = innerW * scale;
  const h = innerH * scale;

  const paths: string[] = [];
  const shapeJitter = font.style.effects?.shapeJitter;
  const widthFx =
    font.style.effects?.widthWiggle || font.style.effects?.widthTaper;
  let strokeSalt = 0;
  for (const pg of layoutResult.glyphs) {
    const gStyle = effectiveStyleForGlyph(font.style, pg.glyph);
    for (let si = 0; si < pg.glyph.strokes.length; si++) {
      const stroke = pg.glyph.strokes[si]!;
      const widthMod = widthFx
        ? makeWidthMod(
            font.style,
            { instanceIndex: pg.instanceIndex * 31 + si, char: pg.char },
            strokeArcLen(stroke),
          )
        : null;
      const { polygon, triangles } = triangulateForStyle(stroke, gStyle, widthMod, pg.glyph.box.h);
      if (polygon.length === 0 || triangles.length === 0) continue;
      const jittered = jitterActive(shapeJitter)
        ? jitterPolygon(
            polygon,
            shapeJitter,
            resolveJitterSeed(
              shapeJitter,
              { instanceIndex: pg.instanceIndex, char: pg.char },
              0x5ec0 ^ strokeSalt,
            ),
          )
        : polygon;
      strokeSalt++;
      // Translate polygon by glyph origin + padding.
      const translated = jittered.map((p) => ({
        x: p.x + pg.origin.x + padding,
        y: p.y + pg.origin.y + padding,
      }));
      paths.push(`<path d="${trianglesD(translated, triangles)}" />`);
    }
  }

  const bg = opts.background
    ? `<rect width="100%" height="100%" fill="${opts.background}" />`
    : '';

  const groupOpen =
    scale === 1
      ? `<g fill="${fill}" stroke="none" fill-rule="nonzero">`
      : `<g transform="scale(${fmt(scale)})" fill="${fill}" stroke="none" fill-rule="nonzero">`;

  const overlay = opts.debugOverlay
    ? buildDebugOverlay(layoutResult, font, padding, scale)
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
    bg,
    groupOpen,
    ...paths,
    `</g>`,
    overlay,
    `</svg>`,
  ].join('');
}

/**
 * Build a non-printing SVG overlay showing each placed glyph's advance
 * box and the kerning offset (if any) between adjacent glyphs on the
 * same line. Pure: only reads positions/sizes already in `layoutResult`
 * and the kerning table from `font`.
 */
function buildDebugOverlay(
  layoutResult: LayoutResult,
  font: Font,
  padding: number,
  scale: number,
): string {
  const parts: string[] = [];
  // Wrap the entire overlay in the same `scale(...)` group so coordinates
  // can stay in font units (matching the glyph paths above).
  const wrap = scale === 1 ? null : `scale(${fmt(scale)})`;
  parts.push(
    wrap
      ? `<g transform="${wrap}" fill="none" pointer-events="none" font-family="monospace">`
      : `<g fill="none" pointer-events="none" font-family="monospace">`,
  );

  const boxStroke = '#888';
  const boxFill = 'rgba(140,140,140,0.04)';
  const labelFill = '#888';
  const sbStroke = '#bbb';
  const kernPos = '#1d6fe6';
  const kernNeg = '#e0457b';

  // Pick a label size that scales with the average glyph; cap so it stays
  // readable but unobtrusive.
  let avgBoxH = 0;
  for (const pg of layoutResult.glyphs) avgBoxH += pg.glyph.box.h;
  avgBoxH = layoutResult.glyphs.length > 0
    ? avgBoxH / layoutResult.glyphs.length
    : 100;
  const labelPx = Math.max(6, Math.min(14, avgBoxH * 0.12));
  const tickPx = Math.max(0.5, avgBoxH * 0.005);

  // 1) Per-glyph: advance box + side-bearing ticks + char label.
  for (const pg of layoutResult.glyphs) {
    const x = pg.origin.x + padding;
    const y = pg.origin.y + padding;
    const w = pg.glyph.box.w;
    const h = pg.glyph.box.h;
    parts.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" ` +
        `fill="${boxFill}" stroke="${boxStroke}" stroke-width="${fmt(tickPx)}" />`,
    );
    const lsb = pg.glyph.sidebearings?.left ?? 0;
    const rsb = pg.glyph.sidebearings?.right ?? 0;
    if (lsb !== 0) {
      parts.push(
        `<line x1="${fmt(x - lsb)}" y1="${fmt(y)}" x2="${fmt(x - lsb)}" y2="${fmt(y + h)}" ` +
          `stroke="${sbStroke}" stroke-width="${fmt(tickPx)}" stroke-dasharray="${fmt(tickPx * 4)} ${fmt(tickPx * 4)}" />`,
      );
    }
    if (rsb !== 0) {
      parts.push(
        `<line x1="${fmt(x + w + rsb)}" y1="${fmt(y)}" x2="${fmt(x + w + rsb)}" y2="${fmt(y + h)}" ` +
          `stroke="${sbStroke}" stroke-width="${fmt(tickPx)}" stroke-dasharray="${fmt(tickPx * 4)} ${fmt(tickPx * 4)}" />`,
      );
    }
    // Char label in the top-left of the box.
    parts.push(
      `<text x="${fmt(x + labelPx * 0.3)}" y="${fmt(y + labelPx * 1.05)}" ` +
        `font-size="${fmt(labelPx)}" fill="${labelFill}">${escapeXml(pg.char)}</text>`,
    );
  }

  // 2) Kerning between adjacent glyphs on the same baseline (same y).
  const kerning = font.kerning;
  if (kerning) {
    const scaleX = font.style.scaleX;
    for (let i = 1; i < layoutResult.glyphs.length; i++) {
      const prev = layoutResult.glyphs[i - 1]!;
      const cur = layoutResult.glyphs[i]!;
      // Different lines: skip (origins.y differs in line steps).
      if (Math.abs(prev.origin.y - cur.origin.y) > 0.5) continue;
      const k = kerning[prev.char + cur.char];
      if (k === undefined || k === 0) continue;
      const dx = k * scaleX;
      const color = k > 0 ? kernPos : kernNeg;
      // Draw a horizontal bar at mid-height between the two boxes,
      // spanning the kern delta. Anchor at the right edge of the prev
      // glyph's advance box (= where the cursor was BEFORE the kern).
      const yMid = prev.origin.y + padding + prev.glyph.box.h * 0.5;
      const x0 = prev.origin.x + prev.glyph.box.w + padding;
      const x1 = x0 + dx;
      const xa = Math.min(x0, x1);
      const xb = Math.max(x0, x1);
      parts.push(
        `<rect x="${fmt(xa)}" y="${fmt(yMid - tickPx * 2)}" width="${fmt(xb - xa)}" height="${fmt(tickPx * 4)}" ` +
          `fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="${fmt(tickPx)}" />`,
      );
      parts.push(
        `<text x="${fmt((xa + xb) / 2)}" y="${fmt(yMid - tickPx * 4)}" ` +
          `text-anchor="middle" font-size="${fmt(labelPx * 0.85)}" fill="${color}">` +
          `${k > 0 ? '+' : ''}${fmt(k)}</text>`,
      );
    }
  }

  parts.push('</g>');
  return parts.join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
