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

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
    bg,
    groupOpen,
    ...paths,
    `</g>`,
    `</svg>`,
  ].join('');
}
