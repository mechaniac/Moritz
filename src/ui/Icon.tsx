/**
 * `<Icon>` — render a single glyph from the icon font as inline SVG.
 *
 * The icon font is a normal `Font` value (see `src/data/iconFont.ts`),
 * so icons are designed in the same GlyphSetter and outlined by the same
 * stroke pipeline. That means an icon visually matches the active style
 * if you want it to (pass a `style` prop), or stays neutral by default.
 */

import { useMemo } from 'react';
import { iconFont, type IconName } from '../data/iconFont.js';
import { outlineStroke } from '../core/stroke.js';
import { triangulatePolygon } from '../core/triangulate.js';
import type { Font, StyleSettings } from '../core/types.js';

type Props = {
  name: IconName;
  /** Pixel size of the rendered icon (square). Defaults to 16. */
  size?: number;
  /** Override font (defaults to `iconFont`). Useful if a project ships its
   *  own icon set. Must be a `Font` whose `glyphs` keys include `name`. */
  font?: Font;
  /** Override style for the outliner. Defaults to the icon font's bundled
   *  style. Pass `useAppStore.style` to make icons match the active style. */
  style?: StyleSettings;
  /** SVG fill colour. Defaults to `currentColor` so icons inherit the
   *  surrounding text colour. */
  color?: string;
  className?: string;
  title?: string;
};

export function Icon(props: Props): JSX.Element | null {
  const { name, size = 16, font = iconFont, style, color = 'currentColor', className, title } = props;
  const settings = style ?? font.style;
  const glyph = font.glyphs[name];

  const paths = useMemo(() => {
    if (!glyph) return [] as string[];
    return glyph.strokes.map((s) => {
      const polygon = outlineStroke(s, settings, null);
      if (polygon.length < 3) return '';
      const tris = triangulatePolygon(polygon);
      // Render the polygon outline; triangulation is computed only to
      // match the rest of the pipeline's invariants and is unused here.
      void tris;
      const d = polygon
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');
      return `${d}Z`;
    });
  }, [glyph, settings]);

  if (!glyph) return null;
  const w = glyph.box.w || 1;
  const h = glyph.box.h || 1;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <g fill={color}>
        {paths.map((d, i) => (d ? <path key={i} d={d} /> : null))}
      </g>
    </svg>
  );
}
