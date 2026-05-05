/**
 * Render outlined glyphs to an SVG string. Pure function; no DOM.
 *
 * Coordinate system: glyph-space y grows DOWNWARD (typical screen). The SVG
 * uses the same orientation, so no flip is applied here.
 */

import type { LayoutResult } from '../layout.js';
import { outlineStroke } from '../stroke.js';
import type { Font, Vec2 } from '../types.js';

export type SvgRenderOptions = {
  readonly fill?: string; // CSS color for glyph polygons. Default 'black'.
  readonly background?: string; // optional bg rect
  readonly padding?: number; // padding around the layout bbox in font units
  readonly scale?: number; // uniform scale applied to the rendered glyphs (default 1)
};

function polygonToPathD(points: readonly Vec2[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  parts.push(`M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`);
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${fmt(points[i]!.x)} ${fmt(points[i]!.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
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
  for (const pg of layoutResult.glyphs) {
    for (const stroke of pg.glyph.strokes) {
      const polygon = outlineStroke(stroke, font.style);
      if (polygon.length === 0) continue;
      // Translate polygon by glyph origin + padding.
      const translated = polygon.map((p) => ({
        x: p.x + pg.origin.x + padding,
        y: p.y + pg.origin.y + padding,
      }));
      paths.push(`<path d="${polygonToPathD(translated)}" />`);
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
