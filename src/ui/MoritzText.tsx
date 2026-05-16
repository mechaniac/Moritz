import { useMemo } from 'react';
import { layout } from '../core/layout.js';
import { effectiveStyleForGlyph, outlineStroke } from '../core/stroke.js';
import { triangulatePolygon } from '../core/triangulate.js';
import type { Font, Glyph, Vec2 } from '../core/types.js';
import { useAppStore } from '../state/store.js';

export function MoritzText(props: {
  text: string;
  font: Font;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}): JSX.Element {
  const { text, font, size = 13, color = 'currentColor' } = props;
  const laidOut = useMemo(() => layout(text, font, { lineHeightFactor: 1 }), [text, font]);
  const glyphPaths = useMemo(
    () =>
      laidOut.glyphs.map((placed) => ({
        x: placed.origin.x,
        y: placed.origin.y,
        paths: glyphPathsForFont(placed.glyph, font),
      })),
    [laidOut.glyphs, font],
  );

  if (glyphPaths.length === 0) {
    return <span className={props.className}>{text}</span>;
  }

  const unitW = Math.max(laidOut.width, 1);
  const unitH = Math.max(laidOut.height, 1);
  const pixelW = Math.max(1, (unitW / unitH) * size);

  return (
    <svg
      className={props.className}
      width={pixelW}
      height={size}
      viewBox={`0 0 ${unitW} ${unitH}`}
      preserveAspectRatio="xMidYMid meet"
      role={props.title ? 'img' : 'presentation'}
      aria-label={props.title}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <g fill={color}>
        {glyphPaths.map((placed, glyphIdx) => (
          <g key={glyphIdx} transform={`translate(${placed.x} ${placed.y})`}>
            {placed.paths.map((d, pathIdx) => (
              d ? <path key={pathIdx} d={d} /> : null
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

export function MoritzLabel(props: {
  text: string;
  size?: number;
  color?: string;
  className?: string;
}): JSX.Element {
  const font = useAppStore((s) => s.font);
  return (
    <MoritzText
      text={props.text}
      font={font}
      size={props.size}
      color={props.color}
      className={props.className}
    />
  );
}

function glyphPathsForFont(glyph: Glyph, font: Font): readonly string[] {
  const style = effectiveStyleForGlyph(font.style, glyph);
  return glyph.strokes.map((stroke) => {
    const polygon = outlineStroke(stroke, style, null);
    if (polygon.length < 3) return '';
    const triangles = triangulatePolygon(polygon);
    return trianglesD(polygon, triangles);
  });
}

function trianglesD(
  polygon: readonly Vec2[],
  triangles: readonly (readonly [number, number, number])[],
): string {
  let d = '';
  for (const triangle of triangles) {
    const a = polygon[triangle[0]]!;
    const b = polygon[triangle[1]]!;
    const c = polygon[triangle[2]]!;
    d += `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${c.x.toFixed(2)} ${c.y.toFixed(2)} Z `;
  }
  return d;
}
