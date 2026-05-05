/**
 * TypeSetter v0 — load a comic page image, place draggable text blocks,
 * edit text + per-block style, export the rendered text as SVG / PNG.
 *
 * Each block runs the full pipeline (layout → transform → outline → svg)
 * with the active font's style modulated by `bold` (stroke-width multiplier)
 * and `italic` (added slant). The same SVG is what gets exported.
 */

import { useMemo, useRef, useState } from 'react';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { svgToPng } from '../../core/export/png.js';
import { downloadBlob } from '../../state/persistence.js';
import { useAppStore } from '../../state/store.js';
import {
  useTypesetterStore,
  type TextBlock,
} from '../../state/typesetterStore.js';
import type { Font } from '../../core/types.js';

export function TypeSetter(): JSX.Element {
  const font = useAppStore((s) => s.font);
  const {
    pageImage,
    pageW,
    pageH,
    blocks,
    selectedBlockId,
    setPage,
    addBlock,
    updateBlock,
    deleteBlock,
    selectBlock,
  } = useTypesetterStore();

  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const onLoadImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPage(url, img.naturalWidth, img.naturalHeight);
    img.src = url;
  };

  const onAddBlock = () => {
    addBlock({
      x: pageW * 0.3,
      y: pageH * 0.3,
      fontSize: 28,
      text: 'HELLO!',
      bold: 1,
      italic: 0,
    });
  };

  const selected = blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: stage */}
      <div style={{ flex: 1, overflow: 'auto', background: '#1a1a1a', padding: 16 }}>
        <div style={{ marginBottom: 8, color: '#ddd', display: 'flex', gap: 8 }}>
          <label style={{ background: '#fff', color: '#222', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>
            Load page…
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onLoadImage(f);
              }}
            />
          </label>
          <button onClick={onAddBlock} disabled={!pageImage}>
            + Text block
          </button>
          <button
            onClick={() => exportPage(font, blocks, pageW, pageH, 'svg')}
            disabled={blocks.length === 0}
          >
            Export SVG
          </button>
          <button
            onClick={() => exportPage(font, blocks, pageW, pageH, 'png')}
            disabled={blocks.length === 0}
          >
            Export PNG
          </button>
          <span style={{ marginLeft: 12 }}>
            Zoom
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </span>
        </div>
        {pageImage ? (
          <div
            ref={stageRef}
            style={{
              position: 'relative',
              width: pageW * zoom,
              height: pageH * zoom,
              background: `url(${pageImage}) center/contain no-repeat`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              transformOrigin: 'top left',
            }}
            onClick={() => selectBlock(null)}
          >
            {blocks.map((b) => (
              <BlockOverlay
                key={b.id}
                block={b}
                font={font}
                zoom={zoom}
                selected={b.id === selectedBlockId}
                onSelect={() => selectBlock(b.id)}
                onMove={(x, y) => updateBlock(b.id, { x, y })}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: '#888', padding: 24 }}>Load a comic page image to start.</div>
        )}
      </div>

      {/* Right: inspector */}
      <aside
        style={{
          width: 280,
          background: '#fafafa',
          borderLeft: '1px solid #ddd',
          padding: 12,
          overflowY: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Block</h3>
        {selected ? (
          <BlockInspector
            block={selected}
            onChange={(patch) => updateBlock(selected.id, patch)}
            onDelete={() => deleteBlock(selected.id)}
          />
        ) : (
          <p style={{ color: '#666' }}>Click a text block to edit.</p>
        )}
      </aside>
    </div>
  );
}

// ---------- Block on the page -----------------------------------------------

function BlockOverlay(props: {
  block: TextBlock;
  font: Font;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}): JSX.Element {
  const { block, font, zoom } = props;
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const svgString = useMemo(
    () => renderBlockSvg(font, block),
    [font, block],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    props.onSelect();
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { dx: startX, dy: startY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const moveX = (e.clientX - dragRef.current.dx) / zoom;
    const moveY = (e.clientY - dragRef.current.dy) / zoom;
    props.onMove(block.x + moveX, block.y + moveY);
    dragRef.current = { dx: e.clientX, dy: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: block.x * zoom,
        top: block.y * zoom,
        cursor: 'move',
        outline: props.selected ? '2px dashed #0a84ff' : 'none',
        padding: 2,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // The SVG already has its own width/height; scale via wrapper to honor zoom.
      dangerouslySetInnerHTML={{ __html: scaleSvg(svgString, zoom * (block.fontSize / 140)) }}
    />
  );
}

function BlockInspector(props: {
  block: TextBlock;
  onChange: (p: Partial<TextBlock>) => void;
  onDelete: () => void;
}): JSX.Element {
  const { block, onChange } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', flexDirection: 'column' }}>
        Text
        <textarea
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value.toUpperCase() })}
          rows={3}
          style={{ fontSize: 14, padding: 4 }}
        />
      </label>
      <NumberRow
        label="Font size"
        min={8}
        max={120}
        step={1}
        value={block.fontSize}
        onChange={(v) => onChange({ fontSize: v })}
      />
      <NumberRow
        label="Bold (×width)"
        min={0.3}
        max={3}
        step={0.05}
        value={block.bold}
        onChange={(v) => onChange({ bold: v })}
      />
      <NumberRow
        label="Italic (rad)"
        min={-0.5}
        max={0.5}
        step={0.01}
        value={block.italic}
        onChange={(v) => onChange({ italic: v })}
      />
      <button onClick={props.onDelete} style={{ marginTop: 12 }}>
        Delete block
      </button>
    </div>
  );
}

function NumberRow(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{props.label}</span>
        <span style={{ color: '#666', fontVariantNumeric: 'tabular-nums' }}>
          {props.value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

// ---------- Render helpers --------------------------------------------------

function applyBlockOverrides(font: Font, block: TextBlock): Font {
  const baseW = font.style.defaultWidth;
  const scaledSamples = baseW.samples.map((s) => ({
    t: s.t,
    width: s.width * block.bold,
  }));
  return {
    ...font,
    style: {
      ...font.style,
      slant: font.style.slant + block.italic,
      defaultWidth: { samples: scaledSamples },
    },
  };
}

function renderBlockSvg(font: Font, block: TextBlock): string {
  const styled = applyBlockOverrides(font, block);
  const result = layout(block.text, styled, { lineHeightFactor: 1.1 });
  return renderLayoutToSvg(result, styled, { padding: 0 });
}

/** Scale an existing SVG by replacing its width/height attributes. */
function scaleSvg(svg: string, factor: number): string {
  return svg
    .replace(/\bwidth="([\d.]+)"/, (_, w) => `width="${(parseFloat(w) * factor).toFixed(2)}"`)
    .replace(/\bheight="([\d.]+)"/, (_, h) => `height="${(parseFloat(h) * factor).toFixed(2)}"`);
}

// ---------- Page export -----------------------------------------------------

/**
 * Produce a single SVG (or PNG) of all text blocks, positioned in page space.
 * The page image itself is intentionally NOT included — exports are
 * transparent overlays meant to be composited over the original artwork.
 */
function buildPageOverlaySvg(
  font: Font,
  blocks: readonly TextBlock[],
  pageW: number,
  pageH: number,
): string {
  const groups = blocks.map((b) => {
    const styled = applyBlockOverrides(font, b);
    const layoutResult = layout(b.text, styled, { lineHeightFactor: 1.1 });
    const inner = renderLayoutToSvg(layoutResult, styled, { padding: 0 });
    // Strip outer <svg> wrapper, keep its inner content; wrap in a <g> with
    // translation + scale to position on the page.
    const innerBody = stripSvgWrapper(inner);
    const scale = b.fontSize / 140; // 140 ≈ default glyph box height
    return `<g transform="translate(${b.x} ${b.y}) scale(${scale})">${innerBody}</g>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" width="${pageW}" height="${pageH}">`,
    ...groups,
    `</svg>`,
  ].join('');
}

function stripSvgWrapper(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

async function exportPage(
  font: Font,
  blocks: readonly TextBlock[],
  pageW: number,
  pageH: number,
  format: 'svg' | 'png',
): Promise<void> {
  const svg = buildPageOverlaySvg(font, blocks, pageW, pageH);
  if (format === 'svg') {
    downloadBlob('moritz-lettering.svg', svg, 'image/svg+xml');
    return;
  }
  const dataUrl = await svgToPng(svg, { pixelsPerUnit: 2 });
  // Convert data URL to blob and download.
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moritz-lettering.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
