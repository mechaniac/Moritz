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
import { bubbleGeometry, type BubbleShape } from '../../core/bubble.js';
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
    const w = Math.max(120, pageW * 0.18);
    const h = Math.max(80, pageH * 0.12);
    addBlock({
      x: pageW * 0.3,
      y: pageH * 0.3,
      fontSize: 28,
      text: 'HELLO!',
      bold: 1,
      italic: 0,
      shape: 'speech',
      bubbleW: w,
      bubbleH: h,
      tailX: w * 0.25,
      tailY: h + h * 0.6,
      bubbleStroke: 3,
    });
  };

  const selected = blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="mz-typesetter" style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: stage */}
      <div className="mz-typesetter__stage" style={{ flex: 1, overflow: 'auto', background: '#1a1a1a', padding: 16 }}>
        <div className="mz-typesetter__toolbar" style={{ marginBottom: 8, color: '#ddd', display: 'flex', gap: 8 }}>
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
            className="mz-typesetter__page"
            style={{
              position: 'relative',
              width: pageW * zoom,
              height: pageH * zoom,
              background: `url(${pageImage}) center/contain no-repeat`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              transformOrigin: 'top left',
            }}
            onClick={(e) => {
              // Only deselect when the bare page is clicked. Block overlays
              // stop pointerdown propagation, but `click` is a separate event
              // that still bubbles, so without this guard every block click
              // selects-then-immediately-deselects.
              if (e.target === e.currentTarget) selectBlock(null);
            }}
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
                onTailMove={(tailX, tailY) =>
                  updateBlock(b.id, { tailX, tailY })
                }
              />
            ))}
          </div>
        ) : (
          <div style={{ color: '#888', padding: 24 }}>Load a comic page image to start.</div>
        )}
      </div>

      {/* Right: inspector */}
      <aside
        className="mz-typesetter__inspector"
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
  onTailMove: (tailX: number, tailY: number) => void;
}): JSX.Element {
  const { block, font, zoom } = props;
  const moveRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const tailRef = useRef<boolean>(false);

  // Inner SVG includes bubble + text, sized to a bounding box that contains
  // both the bubble (and tail) and the text glyphs.
  const inner = useMemo(() => buildBlockSvg(font, block), [font, block]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    props.onSelect();
    moveRef.current = { lastX: e.clientX, lastY: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!moveRef.current) return;
    const dx = (e.clientX - moveRef.current.lastX) / zoom;
    const dy = (e.clientY - moveRef.current.lastY) / zoom;
    props.onMove(block.x + dx, block.y + dy);
    moveRef.current = { lastX: e.clientX, lastY: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    moveRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  // The inner SVG is in image-space units; `zoom` scales the wrapper.
  const w = inner.width;
  const h = inner.height;

  return (
    <div
      className={`mz-block${props.selected ? ' mz-block--selected' : ''}`}
      style={{
        position: 'absolute',
        left: (block.x + inner.offsetX) * zoom,
        top: (block.y + inner.offsetY) * zoom,
        width: w * zoom,
        height: h * zoom,
        cursor: 'move',
        outline: props.selected ? '1px dashed #0a84ff' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: scaleSvgToFit(inner.svg, w * zoom, h * zoom) }}
      />
      {props.selected && (block.shape === 'speech' || block.shape === 'cloud') && (
        <TailHandle
          block={block}
          zoom={zoom}
          inner={inner}
          tailRef={tailRef}
          onTailMove={props.onTailMove}
        />
      )}
    </div>
  );
}

/** Drag handle on the bubble's tail tip (only shown when the block is selected). */
function TailHandle(props: {
  block: TextBlock;
  zoom: number;
  inner: { offsetX: number; offsetY: number };
  tailRef: React.MutableRefObject<boolean>;
  onTailMove: (tailX: number, tailY: number) => void;
}): JSX.Element {
  const { block, zoom, inner } = props;
  // Tail is in bubble-local coords; render it relative to the wrapper.
  const left = (block.tailX - inner.offsetX) * zoom;
  const top = (block.tailY - inner.offsetY) * zoom;
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    props.tailRef.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!props.tailRef.current) return;
    const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const localX = (e.clientX - rect.left) / zoom + inner.offsetX;
    const localY = (e.clientY - rect.top) / zoom + inner.offsetY;
    props.onTailMove(localX, localY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    props.tailRef.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  return (
    <div
      style={{
        position: 'absolute',
        left: left - 6,
        top: top - 6,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #0a84ff',
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          style={{ fontSize: 14, padding: 4 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>Bubble shape</span>
        <select
          value={block.shape}
          onChange={(e) => onChange({ shape: e.target.value as BubbleShape })}
          style={{ padding: 4 }}
        >
          <option value="none">None</option>
          <option value="rect">Caption (rect)</option>
          <option value="speech">Speech bubble</option>
          <option value="cloud">Thought cloud</option>
        </select>
      </label>
      {block.shape !== 'none' && (
        <>
          <NumberRow
            label="Bubble W"
            min={40}
            max={1200}
            step={2}
            value={block.bubbleW}
            onChange={(v) => onChange({ bubbleW: v })}
          />
          <NumberRow
            label="Bubble H"
            min={30}
            max={800}
            step={2}
            value={block.bubbleH}
            onChange={(v) => onChange({ bubbleH: v })}
          />
          <NumberRow
            label="Outline"
            min={0}
            max={12}
            step={0.5}
            value={block.bubbleStroke}
            onChange={(v) => onChange({ bubbleStroke: v })}
          />
        </>
      )}
      <NumberRow
        label="Font size"
        min={8}
        max={200}
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

/**
 * Build the inner pieces for a single block (bubble path + text glyphs) as a
 * group of SVG elements expressed in the block's image-pixel coordinate
 * space. (0,0) is the bubble's top-left (or, when shape='none', the text
 * origin). Tail extends into negative space when applicable.
 */
type BlockPieces = {
  /** SVG fragment string (no outer <svg>) ready to be placed in any parent. */
  body: string;
  /** Tight bbox of the fragment in block-local image-pixel space. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function buildBlockPieces(font: Font, block: TextBlock): BlockPieces {
  const styled = applyBlockOverrides(font, block);
  const result = layout(block.text, styled, { lineHeightFactor: 1.1 });
  const textInner = renderLayoutToSvg(result, styled, { padding: 0 });
  const textBody = stripSvgWrapper(textInner);
  const textW = parseFloat(/width="([\d.]+)"/.exec(textInner)?.[1] ?? '0');
  const textH = parseFloat(/height="([\d.]+)"/.exec(textInner)?.[1] ?? '0');
  const scale = block.fontSize / 140; // 140 ≈ default glyph box height

  const parts: string[] = [];

  // Bubble first (drawn behind text).
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (block.shape !== 'none') {
    const tail = { x: block.tailX, y: block.tailY };
    const geom = bubbleGeometry(block.shape, block.bubbleW, block.bubbleH, tail);
    const sw = block.bubbleStroke;
    parts.push(
      `<g fill="white" stroke="black" stroke-width="${sw}" stroke-linejoin="round">`,
      `<path d="${geom.main}" />`,
      ...geom.extras.map((d) => `<path d="${d}" />`),
      `</g>`,
    );
    minX = Math.min(0, tail.x) - sw;
    minY = Math.min(0, tail.y) - sw;
    maxX = Math.max(block.bubbleW, tail.x) + sw;
    maxY = Math.max(block.bubbleH, tail.y) + sw;
  }

  // Text: centered inside the bubble (or at 0,0 when shape='none').
  const tw = textW * scale;
  const th = textH * scale;
  let tx = 0;
  let ty = 0;
  if (block.shape !== 'none') {
    tx = (block.bubbleW - tw) / 2;
    ty = (block.bubbleH - th) / 2;
  }
  parts.push(
    `<g transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(scale)})">`,
    textBody,
    `</g>`,
  );
  if (block.shape === 'none') {
    minX = Math.min(minX, 0);
    minY = Math.min(minY, 0);
    maxX = Math.max(maxX, tw);
    maxY = Math.max(maxY, th);
  }

  return { body: parts.join(''), minX, minY, maxX, maxY };
}

const fmt = (n: number): string => Number(n.toFixed(2)).toString();

function buildBlockSvg(
  font: Font,
  block: TextBlock,
): { svg: string; width: number; height: number; offsetX: number; offsetY: number } {
  const pieces = buildBlockPieces(font, block);
  const w = Math.max(1, pieces.maxX - pieces.minX);
  const h = Math.max(1, pieces.maxY - pieces.minY);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(pieces.minX)} ${fmt(pieces.minY)} ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
    pieces.body,
    `</svg>`,
  ].join('');
  return { svg, width: w, height: h, offsetX: pieces.minX, offsetY: pieces.minY };
}

/** Force an SVG's width/height to a target size in screen pixels. */
function scaleSvgToFit(svg: string, w: number, h: number): string {
  return svg
    .replace(/\bwidth="[^"]+"/, `width="${w.toFixed(2)}"`)
    .replace(/\bheight="[^"]+"/, `height="${h.toFixed(2)}"`);
}

// ---------- Page export -----------------------------------------------------

/**
 * Produce a single SVG (or PNG) of all text blocks + bubbles, positioned in
 * page space. The page image itself is intentionally NOT included — exports
 * are transparent overlays meant to be composited over the original artwork.
 */
function buildPageOverlaySvg(
  font: Font,
  blocks: readonly TextBlock[],
  pageW: number,
  pageH: number,
): string {
  const groups = blocks.map((b) => {
    const pieces = buildBlockPieces(font, b);
    return `<g transform="translate(${fmt(b.x)} ${fmt(b.y)})">${pieces.body}</g>`;
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
