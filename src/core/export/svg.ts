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
import { relaxCurves, relaxSliderToParams, relaxTangents } from '../relax.js';
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
   *   - kerning offsets between adjacent glyphs (a labeled red bar
   *     spanning the [previous-cursor, applied-kern] range)
   *   - on hover of any glyph: a small red "+" badge sitting at the
   *     position where the kerning bar to the NEXT glyph would be (only
   *     when no kerning entry exists yet). Carries `data-action="add-kern"`
   *     and `data-pair="AB"` so the host can wire a click handler via
   *     event delegation.
   *   - each overlay element carries a <title> child so hovering it in
   *     a browser surfaces the underlying values as a native tooltip
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
  let pinned: ReadonlySet<number> = new Set();
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
    pinned = new Set(r.anchorPolygonIndices);
  } else {
    polygon = outlineStroke(stroke, style, widthMod);
    if (evenness > 0 && polygon.length >= 3) {
      polygon = redistributePolygonEvenly(polygon, evenness);
    }
    triangles = triangulatePolygon(polygon);
  }
  // Relax passes: smooth the polygon while pinning anchors. Index list
  // stays valid because the passes preserve vertex count and order.
  const rc = relaxSliderToParams(style.relaxCurves ?? 0);
  if (rc.iterations > 0 && polygon.length >= 3) {
    polygon = relaxCurves(polygon, pinned, rc.strength, rc.iterations);
  }
  const rt = relaxSliderToParams(style.relaxTangents ?? 0);
  if (rt.iterations > 0 && polygon.length >= 3) {
    polygon = relaxTangents(polygon, pinned, rt.strength, rt.iterations);
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
      ? `<g transform="${wrap}" fill="none" font-family="monospace">`
      : `<g fill="none" font-family="monospace">`,
  );
  // CSS: keep each glyph's "+K" helper hidden by default; reveal it only
  // while the user is hovering THAT glyph (or the helper itself — which
  // matters because the helper sits in the gap, OUTSIDE the glyph box).
  parts.push(
    `<style>` +
      `.mz-glyph .mz-add-kern{display:none}` +
      `.mz-glyph:hover .mz-add-kern{display:inline}` +
      `.mz-add-kern{cursor:pointer}` +
      `</style>`,
  );

  const boxStroke = '#888';
  const boxFill = 'rgba(140,140,140,0.04)';
  const labelFill = '#444';
  // Distinct colors per spacing component so the gap composition is
  // obvious at a glance (matches the per-element <title> tooltips).
  const lsbColor = '#1d6fe6';   // left side-bearing  — blue
  const rsbColor = '#15a36b';   // right side-bearing — green
  const trackColor = '#f0a020'; // tracking           — orange
  const kernColor = '#e0457b';  // kerning            — red

  // Pick a label size that scales with the average glyph; cap so it stays
  // readable but unobtrusive.
  let avgBoxH = 0;
  for (const pg of layoutResult.glyphs) avgBoxH += pg.glyph.box.h;
  avgBoxH = layoutResult.glyphs.length > 0
    ? avgBoxH / layoutResult.glyphs.length
    : 100;
  const labelPx = Math.max(6, Math.min(14, avgBoxH * 0.12));
  const tickPx = Math.max(0.5, avgBoxH * 0.005);

  // 1) Per-glyph: advance box + side-bearing strips + char label, plus a
  // hover-only "+K" helper for the pair (this glyph, next glyph) when
  // no kerning entry exists yet. The helper sits at the same position
  // an actual kerning bar would occupy. Each glyph is wrapped in its
  // own <g class="mz-glyph"> so the CSS :hover above scopes the helper
  // strictly to that glyph.
  const trackingTop = font.style.tracking ?? 0;
  const kerningMap = font.kerning;
  const scaleXTop = font.style.scaleX;
  const helperSq = Math.max(8, Math.min(16, avgBoxH * 0.12));
  for (let gi = 0; gi < layoutResult.glyphs.length; gi++) {
    const pg = layoutResult.glyphs[gi]!;
    parts.push(`<g class="mz-glyph">`);
    const x = pg.origin.x + padding;
    const y = pg.origin.y + padding;
    const w = pg.glyph.box.w;
    const h = pg.glyph.box.h;
    const lsb = pg.glyph.sidebearings?.left ?? 0;
    const rsb = pg.glyph.sidebearings?.right ?? 0;
    const tip =
      `'${pg.char}' #${pg.instanceIndex}\n` +
      `box: ${fmt(w)} \u00d7 ${fmt(h)}\n` +
      `origin: (${fmt(pg.origin.x)}, ${fmt(pg.origin.y)})\n` +
      `sidebearings: L ${fmt(lsb)}  R ${fmt(rsb)}`;
    parts.push(`<g pointer-events="all"><title>${escapeXml(tip)}</title>`);
    parts.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" ` +
        `fill="${boxFill}" stroke="${boxStroke}" stroke-width="${fmt(tickPx)}" />`,
    );
    parts.push('</g>');
    // Side-bearing strips: shaded full-height bands OUTSIDE the box. These
    // visualize where the inter-glyph gap is coming from. Drawn as their
    // own <g> so each strip has its own hover tooltip.
    if (lsb > 0) {
      parts.push(
        `<g pointer-events="all"><title>${escapeXml(`'${pg.char}' left side-bearing: ${fmt(lsb)}`)}</title>` +
          `<rect x="${fmt(x - lsb)}" y="${fmt(y)}" width="${fmt(lsb)}" height="${fmt(h)}" ` +
          `fill="${lsbColor}" fill-opacity="0.18" stroke="${lsbColor}" stroke-opacity="0.6" stroke-width="${fmt(tickPx)}" />` +
          `</g>`,
      );
    }
    if (rsb > 0) {
      parts.push(
        `<g pointer-events="all"><title>${escapeXml(`'${pg.char}' right side-bearing: ${fmt(rsb)}`)}</title>` +
          `<rect x="${fmt(x + w)}" y="${fmt(y)}" width="${fmt(rsb)}" height="${fmt(h)}" ` +
          `fill="${rsbColor}" fill-opacity="0.18" stroke="${rsbColor}" stroke-opacity="0.6" stroke-width="${fmt(tickPx)}" />` +
          `</g>`,
      );
    }
    // Negative side-bearings (overhang): same color, dashed outline so the
    // overhang region is still visible even though it lives inside the box.
    if (lsb < 0) {
      parts.push(
        `<g pointer-events="all"><title>${escapeXml(`'${pg.char}' left side-bearing: ${fmt(lsb)} (overhang)`)}</title>` +
          `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(-lsb)}" height="${fmt(h)}" ` +
          `fill="${lsbColor}" fill-opacity="0.12" stroke="${lsbColor}" stroke-dasharray="${fmt(tickPx * 4)} ${fmt(tickPx * 4)}" stroke-width="${fmt(tickPx)}" />` +
          `</g>`,
      );
    }
    if (rsb < 0) {
      parts.push(
        `<g pointer-events="all"><title>${escapeXml(`'${pg.char}' right side-bearing: ${fmt(rsb)} (overhang)`)}</title>` +
          `<rect x="${fmt(x + w + rsb)}" y="${fmt(y)}" width="${fmt(-rsb)}" height="${fmt(h)}" ` +
          `fill="${rsbColor}" fill-opacity="0.12" stroke="${rsbColor}" stroke-dasharray="${fmt(tickPx * 4)} ${fmt(tickPx * 4)}" stroke-width="${fmt(tickPx)}" />` +
          `</g>`,
      );
    }
    // Char label in the top-left of the box.
    parts.push(
      `<text x="${fmt(x + labelPx * 0.3)}" y="${fmt(y + labelPx * 1.05)}" ` +
        `font-size="${fmt(labelPx)}" fill="${labelFill}">${escapeXml(pg.char)}</text>`,
    );

    // Hover-only "+K" helper for this glyph's outgoing pair. Position
    // matches where a real kerning bar would draw (centered on the
    // post-tracking cursor, mid-height of the glyph band).
    const next = layoutResult.glyphs[gi + 1];
    const sameLine = next && Math.abs(next.origin.y - pg.origin.y) <= 0.5;
    if (sameLine && next) {
      const pair = pg.char + next.char;
      const hasKern = kerningMap && kerningMap[pair] !== undefined;
      if (!hasKern) {
        const prevRightLocal = pg.origin.x + pg.glyph.box.w + padding;
        const rsbLocal = pg.glyph.sidebearings?.right ?? 0;
        const cxHelper = prevRightLocal + rsbLocal + trackingTop;
        const yBaseLocal = Math.max(pg.origin.y, next.origin.y) + padding;
        const hBandLocal = Math.min(pg.glyph.box.h, next.glyph.box.h);
        const cyHelper = yBaseLocal + hBandLocal * 0.5;
        const tip = `Add kerning '${pair}' → jumps to GlyphSetter`;
        // scaleXTop unused at the helper position (k=0 implies kdx=0), but
        // referenced in the tooltip for parity with the real kerning bar.
        void scaleXTop;
        parts.push(
          `<g class="mz-add-kern" data-action="add-kern" data-pair="${escapeXml(pair)}" pointer-events="all">` +
            `<title>${escapeXml(tip)}</title>` +
            `<rect x="${fmt(cxHelper - helperSq / 2)}" y="${fmt(cyHelper - helperSq / 2)}" ` +
              `width="${fmt(helperSq)}" height="${fmt(helperSq)}" ` +
              `fill="${kernColor}" stroke="#fff" stroke-width="${fmt(helperSq * 0.08)}" />` +
            `<text x="${fmt(cxHelper)}" y="${fmt(cyHelper + helperSq * 0.32)}" ` +
              `text-anchor="middle" font-size="${fmt(helperSq * 0.95)}" ` +
              `font-weight="bold" fill="#fff">+</text>` +
            `</g>`,
        );
      }
    }

    parts.push(`</g>`); // close .mz-glyph
  }

  // 2) Inter-glyph spacing components between adjacent glyphs on the same
  // baseline: tracking + kerning. (Side-bearings are shown per glyph above.)
  // The full gap between two consecutive boxes equals
  //     prev.rsb + tracking + kerning*scaleX + cur.lsb
  // Drawing tracking and kerning here lets the user see exactly which
  // contributions made the gap what it is, even when no kerning is set.
  const tracking = font.style.tracking ?? 0;
  const kerning = font.kerning;
  const scaleX = font.style.scaleX;
  for (let i = 1; i < layoutResult.glyphs.length; i++) {
    const prev = layoutResult.glyphs[i - 1]!;
    const cur = layoutResult.glyphs[i]!;
    if (Math.abs(prev.origin.y - cur.origin.y) > 0.5) continue;
    const prevRight = prev.origin.x + prev.glyph.box.w + padding;
    const curLeft = cur.origin.x + padding;
    const rsb = prev.glyph.sidebearings?.right ?? 0;
    const lsb = cur.glyph.sidebearings?.left ?? 0;
    const k = (kerning && kerning[prev.char + cur.char]) ?? 0;
    const kdx = k * scaleX;
    // Strip layout left-to-right, starting at prevRight:
    //   [rsb] [tracking] [kerning] [lsb]   → ends at curLeft
    let x = prevRight + Math.max(0, rsb); // skip rsb strip (drawn per-glyph)
    // Actually rsb already drawn per-glyph; cursor after rsb:
    const afterRsb = prevRight + rsb;
    const afterTrack = afterRsb + tracking;
    void x; void curLeft;

    // Mid-height band shared by tracking + kerning indicators.
    const yBase = Math.max(prev.origin.y, cur.origin.y) + padding;
    const hBand = Math.min(prev.glyph.box.h, cur.glyph.box.h);
    const yMid = yBase + hBand * 0.5;
    const bandH = Math.max(tickPx * 6, hBand * 0.06);

    // Tracking (only if non-zero).
    if (tracking !== 0) {
      const xa = Math.min(afterRsb, afterTrack);
      const xb = Math.max(afterRsb, afterTrack);
      const tip =
        `tracking: ${tracking > 0 ? '+' : ''}${fmt(tracking)} (between '${prev.char}' and '${cur.char}')`;
      parts.push(`<g pointer-events="all"><title>${escapeXml(tip)}</title>`);
      parts.push(
        `<rect x="${fmt(xa)}" y="${fmt(yMid - bandH * 0.5)}" width="${fmt(xb - xa)}" height="${fmt(bandH)}" ` +
          `fill="${trackColor}" fill-opacity="0.35" stroke="${trackColor}" stroke-width="${fmt(tickPx)}" />`,
      );
      parts.push(
        `<text x="${fmt((xa + xb) / 2)}" y="${fmt(yMid - bandH)}" ` +
          `text-anchor="middle" font-size="${fmt(labelPx * 0.85)}" fill="${trackColor}">` +
          `${tracking > 0 ? '+' : ''}${fmt(tracking)}</text>`,
      );
      parts.push('</g>');
    }

    // Kerning: draw whenever an entry exists for this pair (including
    // value 0). Width clamped to a minimum so zero/near-zero deltas
    // still read as a fat vertical bar at the bar's position. Carries
    // `data-action="edit-kern"` / `data-pair` so the host can wire a
    // click handler that jumps to the kerning entry in GlyphSetter.
    const hasKernEntry = kerning && kerning[prev.char + cur.char] !== undefined;
    if (hasKernEntry) {
      const minW = Math.max(tickPx * 6, bandH * 0.6);
      const span = Math.abs(kdx);
      const xa = afterTrack + Math.min(0, kdx) - (span < minW ? (minW - span) * 0.5 : 0);
      const w = Math.max(span, minW);
      const tip =
        `kerning '${prev.char}${cur.char}': ${k > 0 ? '+' : ''}${fmt(k)} font units\n` +
        `applied dx: ${k > 0 ? '+' : ''}${fmt(kdx)} (\u00d7 scaleX ${fmt(scaleX)})\n` +
        `click to edit`;
      parts.push(
        `<g class="mz-edit-kern" data-action="edit-kern" data-pair="${escapeXml(prev.char + cur.char)}" pointer-events="all" style="cursor:pointer">` +
          `<title>${escapeXml(tip)}</title>`,
      );
      parts.push(
        `<rect x="${fmt(xa)}" y="${fmt(yMid - bandH * 0.75)}" width="${fmt(w)}" height="${fmt(bandH * 1.5)}" ` +
          `fill="${kernColor}" fill-opacity="0.55" stroke="${kernColor}" stroke-width="${fmt(tickPx * 1.5)}" />`,
      );
      parts.push(
        `<text x="${fmt(xa + w / 2)}" y="${fmt(yMid + bandH * 1.4)}" ` +
          `text-anchor="middle" font-size="${fmt(labelPx * 0.85)}" fill="${kernColor}">` +
          `${k > 0 ? '+' : ''}${fmt(k)}</text>`,
      );
      parts.push('</g>');
    }

    // Hover-only band covering the FULL gap, transparent fill, so the user
    // can hover anywhere in the gap (including the dead zone left between
    // strips when only side-bearings contribute) and see the breakdown.
    const totalGap = curLeft - prevRight;
    const breakdown =
      `gap '${prev.char}'\u2192'${cur.char}': ${fmt(totalGap)}\n` +
      `  rsb('${prev.char}'): ${fmt(rsb)}\n` +
      `  tracking: ${fmt(tracking)}\n` +
      `  kerning: ${fmt(kdx)} (raw ${fmt(k)} \u00d7 scaleX ${fmt(scaleX)})\n` +
      `  lsb('${cur.char}'): ${fmt(lsb)}`;
    parts.push(
      `<g pointer-events="all"><title>${escapeXml(breakdown)}</title>` +
        `<rect x="${fmt(prevRight)}" y="${fmt(yBase)}" width="${fmt(Math.max(0, totalGap))}" height="${fmt(hBand)}" ` +
        `fill="transparent" />` +
        `</g>`,
    );
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
