/**
 * Render outlined glyphs to an SVG string. Pure function; no DOM.
 *
 * Coordinate system: glyph-space y grows DOWNWARD (typical screen). The SVG
 * uses the same orientation, so no flip is applied here.
 */

import type { LayoutResult } from '../layout.js';
import { outlineStroke } from '../stroke.js';
import { triangulatePolygon } from '../triangulate.js';
import { triangulateStrokeRibbon } from '../ribbon.js';
import { jitterActive, jitterPolygon, resolveJitterSeed } from '../effects.js';
import type { Font, Stroke, StyleSettings, Vec2 } from '../types.js';

export type SvgRenderOptions = {
  readonly fill?: string; // CSS color for glyph polygons. Default 'black'.
  readonly background?: string; // optional bg rect
  readonly padding?: number; // padding around the layout bbox in font units
  readonly scale?: number; // uniform scale applied to the rendered glyphs (default 1)
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
): { polygon: readonly Vec2[]; triangles: readonly (readonly [number, number, number])[] } {
  const mode = style.triMode ?? 'earcut';
  if (mode === 'ribbon-fixed') {
    return triangulateStrokeRibbon(stroke, style, {
      kind: 'fixed',
      samplesPerSegment: style.ribbonSamples ?? 6,
      spread: style.ribbonSpread ?? 1,
      anchorPull: style.ribbonAnchorPull ?? 0,
    });
  }
  if (mode === 'ribbon-density') {
    return triangulateStrokeRibbon(stroke, style, {
      kind: 'density',
      spacing: style.ribbonSpacing ?? 4,
      spread: style.ribbonSpread ?? 1,
      anchorPull: style.ribbonAnchorPull ?? 0,
    });
  }
  const poly = outlineStroke(stroke, style);
  return { polygon: poly, triangles: triangulatePolygon(poly) };
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
  let strokeSalt = 0;
  for (const pg of layoutResult.glyphs) {
    for (const stroke of pg.glyph.strokes) {
      const { polygon, triangles } = triangulateForStyle(stroke, font.style);
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

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
    bg,
    groupOpen,
    ...paths,
    `</g>`,
    `</svg>`,
  ].join('');
}
