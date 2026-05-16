/**
 * TypeSetter v0 — load a comic page image, place draggable text blocks,
 * edit text + per-block style, export the rendered text as SVG / PNG.
 *
 * Each block runs the full pipeline (layout → transform → outline → svg)
 * with the active font's style modulated by `bold` (stroke-width multiplier)
 * and `italic` (added slant). The same SVG is what gets exported.
 */

import { useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { CObject } from '@christof/sigrid-geometry';
import { layout } from '../../core/layout.js';
import { renderLayoutToSvg } from '../../core/export/svg.js';
import { svgToPng } from '../../core/export/png.js';
import { bubbleGeometry } from '../../core/bubble.js';
import { renderBubbleToSvgFragment } from '../../core/bubbleRender.js';
import { ACTIVE_PAGE_REFS, legacyBlockToBlock } from '../../core/page.js';
import { useCanvasInput } from '../../ui/canvas/useCanvasInput.js';
import { effectiveStyleForGlyph } from '../../core/stroke.js';
import { transformStroke, type Affine } from '../../core/transform.js';
import {
  clearNormalOverride,
  moveAnchor,
  moveHandle,
  setNormalOverride,
  translateStroke,
} from '../../core/glyphOps.js';
import { downloadBlob } from '../../state/persistence.js';
import { fontWithOverrides, useAppStore } from '../../state/store.js';
import { resolveBlockFont, resolveBlockStyle } from '../../state/blockResolve.js';
import { builtInFonts } from '../../data/builtInFonts.js';
import { builtInStyles } from '../../data/builtInStyles.js';
import { useBubbleStore } from '../../state/bubbleStore.js';
import { saveBubbleFont } from '../../state/bubblePersistence.js';
import { textPresetSets } from '../../data/textPresets.js';
import {
  PAGE_FORMATS,
  useTypesetterStore,
  type TextBlock,
} from '../../state/typesetterStore.js';
import type {
  Bubble,
  BubbleFont,
  BubbleLayer,
  Font,
  Glyph,
  Stroke,
  Vec2,
  Vertex,
  WidthProfile,
} from '../../core/types.js';
import { Section, StyleControls } from '../stylesetter/StyleControls.js';
import { MgLeftBar, MgRightBar, MgOutliner, type MgTreeNode } from '@christof/magdalena/react';
import { StrokeOverlay, type Selection } from '../glyphsetter/GlyphSetter.js';
import { MoritzLabel } from '../../ui/MoritzText.js';
import { MoritzSelect } from '../../ui/MoritzSelect.js';
import {
  moritzTypeSetterCObjectMetaFromId,
  moritzTypeSetterObjectSelectionFromCObjectId,
  moritzTypeSetterPageCObjectSelection,
  type TypeSetterCObjectInput,
} from '../../core/moritzCObjects.js';

/**
 * Legacy `block.shape` strings ('speech', 'cloud', 'rect') predate the
 * BubbleFont integration. We surface old pages as the matching preset
 * id in the active BubbleFont when one exists.
 */
const LEGACY_SHAPE_TO_PRESET: Readonly<Record<string, string>> = {
  speech: 'speech',
  cloud: 'thought',
  rect: 'caption',
};

export function TypeSetter(): JSX.Element {
  const baseFont = useAppStore((s) => s.font);
  const style = useAppStore((s) => s.style);
  const setStyleOverride = useAppStore((s) => s.setStyleOverride);
  const loadedStyleSettings = useAppStore((s) => s.loadedStyleSettings);
  // The active bubble font (from BubbleSetter). Drives all `shape:'preset'`
  // blocks; if the user switches BubbleFont, every preset-bubble on the
  // page updates automatically.
  const bubbleFont = useBubbleStore((s) => s.font);
  // Pipeline order: glyphsetter → stylesetter → typesetter. The renderer
  // always uses the active style from the store; we synthesize a Font for
  // core consumption that carries it as `.style`.
  // Per-block resolver shared between live render and export so a saved
  // file matches what's on screen (Principle 7 + 4).
  const exportResolveFont = useCallback(
    (b: TextBlock): Font =>
      fontWithOverrides(resolveBlockFont(b, baseFont), resolveBlockStyle(b, style)),
    [baseFont, style],
  );
  const {
    pageImage,
    pageW,
    pageH,
    pageFormatId,
    border,
    blocks,
    selectedBlockId,
    bubbleEditingLayerId,
    setPage,
    setPageFormat,
    setBorder,
    addBlock,
    updateBlock,
    updateBlockBubble,
    updateBlockBubbleLayer,
    setBlockBubble,
    deleteBlock,
    selectBlock,
    selectBubbleEditingLayer,
  } = useTypesetterStore();

  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Free camera (panX, panY, zoom). Pan is in screen px from the
  // workspace origin. The page sits in world space at (0,0)–(pageW,pageH);
  // its rendered top-left is `(panX, panY)` and its rendered size is
  // `(pageW*zoom, pageH*zoom)`. Same convention as every other module.
  const [cam, setCamState] = useState({ zoom: 1, panX: 0, panY: 0 });
  const setCam = (patch: Partial<typeof cam>): void =>
    setCamState((c) => ({ ...c, ...patch }));
  // Auto-fit until the user touches the camera (wheel, pinch, pan or
  // explicit Fit). After that we leave the camera alone.
  const userTouchedRef = useRef(false);

  // Auto-fit page into the surface. Reruns on surface or page resize
  // until the user takes over.
  useLayoutEffect(() => {
    if (userTouchedRef.current) return;
    const el = surfaceRef.current;
    if (!el || pageW <= 0 || pageH <= 0) return;
    const fit = (): void => {
      if (userTouchedRef.current) return;
      const pad = 24;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const aw = Math.max(0, cw - pad * 2);
      const ah = Math.max(0, ch - pad * 2);
      if (aw <= 0 || ah <= 0) return;
      const z = Math.min(aw / pageW, ah / pageH);
      if (!(z > 0) || !Number.isFinite(z)) return;
      setCamState({
        zoom: z,
        panX: (cw - pageW * z) / 2,
        panY: (ch - pageH * z) / 2,
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW, pageH]);

  // Public "Fit" — reset auto-fit so the next layout pass re-centres
  // the page. We just clear the user-touched flag and force a re-run
  // by nudging state (no-op patch is enough because the effect's
  // ResizeObserver will fire on the next frame; for snappier feel we
  // also recompute now).
  const onFit = (): void => {
    userTouchedRef.current = false;
    const el = surfaceRef.current;
    if (!el || pageW <= 0 || pageH <= 0) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const pad = 24;
    const aw = Math.max(0, cw - pad * 2);
    const ah = Math.max(0, ch - pad * 2);
    const z = Math.min(aw / pageW, ah / pageH);
    if (!(z > 0) || !Number.isFinite(z)) return;
    setCamState({
      zoom: z,
      panX: (cw - pageW * z) / 2,
      panY: (ch - pageH * z) / 2,
    });
  };

  const onZoomSlider = (nextZoom: number): void => {
    if (!(nextZoom > 0) || !Number.isFinite(nextZoom)) return;
    userTouchedRef.current = true;
    setCam({ zoom: nextZoom });
  };

  // Shared canvas-shell input: cursor-anchored wheel + pinch zoom +
  // space/middle-mouse pan. Same hook every other module uses.
  const camRef = useRef(cam);
  camRef.current = cam;
  const { spaceDown } = useCanvasInput(surfaceRef, {
    pan: 'both',
    minZoom: 0.02,
    maxZoom: 8,
    getCamera: () => camRef.current,
    setCamera: (patch) => {
      userTouchedRef.current = true;
      setCam(patch);
    },
  });

  // Space/middle-mouse pan drag — wired locally because the hook only
  // owns the gesture detection, not the drag plumbing (see
  // `isPanGesture` in useCanvasInput.ts).
  const panDragRef = useRef<
    | { startClientX: number; startClientY: number; startPanX: number; startPanY: number }
    | null
  >(null);
  const onSurfacePointerDown = (e: React.PointerEvent): void => {
    // Middle-mouse always pans; left-mouse pans when space is held.
    const isPan = e.button === 1 || (e.button === 0 && spaceDown);
    if (!isPan) return;
    e.preventDefault();
    e.stopPropagation();
    panDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: camRef.current.panX,
      startPanY: camRef.current.panY,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    userTouchedRef.current = true;
  };
  const onSurfacePointerMove = (e: React.PointerEvent): void => {
    const d = panDragRef.current;
    if (!d) return;
    setCam({
      panX: d.startPanX + (e.clientX - d.startClientX),
      panY: d.startPanY + (e.clientY - d.startClientY),
    });
  };
  const onSurfacePointerUp = (e: React.PointerEvent): void => {
    if (!panDragRef.current) return;
    panDragRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // The rest of the file keeps its existing per-child `* zoom`
  // multiplication for hit-testing math, so we expose `zoom` as a
  // local alias for readability.
  const zoom = cam.zoom;

  const onLoadImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPage(url, img.naturalWidth, img.naturalHeight);
    img.src = url;
  };

  const onAddBlock = () => {
    const w = Math.max(120, pageW * 0.18);
    const h = Math.max(80, pageH * 0.12);
    // Default new blocks to a bubble from the active BubbleFont so the
    // user's chosen artwork is always what shows up on the page.
    const firstPresetId =
      Object.keys(bubbleFont.bubbles)[0] ?? undefined;
    addBlock({
      x: pageW * 0.3,
      y: pageH * 0.3,
      fontSize: 28,
      text: 'HELLO!',
      bold: 1,
      italic: 0,
      shape: firstPresetId ? 'preset' : 'none',
      ...(firstPresetId ? { bubblePresetId: firstPresetId } : {}),
      bubbleW: w,
      bubbleH: h,
      tailX: w * 0.25,
      tailY: h + h * 0.6,
      bubbleStroke: 3,
    });
  };

  const selected = blocks.find((b) => b.id === selectedBlockId) ?? null;

  // ---------- Bubble-edit mode -------------------------------------------
  // Editing is implicit: whenever the user has a bubble-shaped block
  // selected, anchors + tangent handles for the active layer's strokes
  // are drawn directly on top of the block (see `BlockOverlay`) and
  // the right inspector grows a layer list + Save / Save As / Reset
  // buttons. The preset library is left alone until the user explicitly
  // saves to it; until then all edits live in `block.bubble`
  // (clone-on-first-write, handled by `updateBlockBubbleLayer`).
  const editingBlock = selected;
  const editingPreset =
    editingBlock?.bubblePresetId
      ? bubbleFont.bubbles[editingBlock.bubblePresetId] ?? null
      : null;
  const editingBubble = editingBlock
    ? editingBlock.bubble ?? editingPreset
    : null;
  const editingLayerId =
    bubbleEditingLayerId ?? editingBubble?.layers[0]?.id ?? null;
  const isEditingSelected = !!editingBlock && !!editingBubble;
  const cObjectBlocks = useMemo(
    () =>
      blocks.map((block) =>
        legacyBlockToBlock(block, ACTIVE_PAGE_REFS),
      ),
    [blocks],
  );
  const cObjectInput: TypeSetterCObjectInput = useMemo(
    () => ({
      pageId: 'live',
      pageName: 'Page',
      blocks: cObjectBlocks,
      bubbleFont,
    }),
    [cObjectBlocks, bubbleFont],
  );
  const cObjectSelection = useMemo(
    () =>
      moritzTypeSetterPageCObjectSelection(cObjectInput, {
        blockId: selectedBlockId,
        layerId: isEditingSelected ? bubbleEditingLayerId : null,
      }),
    [cObjectInput, selectedBlockId, isEditingSelected, bubbleEditingLayerId],
  );
  const selectCObject = useCallback(
    (id: string): void => {
      const selection = moritzTypeSetterObjectSelectionFromCObjectId(cObjectInput, id);
      if (selection.kind === 'page') {
        selectBlock(null);
        selectBubbleEditingLayer(null);
        return;
      }
      selectBlock(selection.blockId);
      if (selection.kind === 'bubbleLayer') {
        selectBubbleEditingLayer(selection.layerId);
      } else {
        selectBubbleEditingLayer(null);
      }
    },
    [cObjectInput, selectBlock, selectBubbleEditingLayer],
  );

  const onSaveToPreset = useCallback(() => {
    if (!editingBlock || !editingBubble || !editingBlock.bubblePresetId) return;
    const id = editingBlock.bubblePresetId;
    // Write the live bubble back to the active BubbleFont under its
    // existing id, then persist the whole font.
    const nextFont: BubbleFont = {
      ...bubbleFont,
      bubbles: { ...bubbleFont.bubbles, [id]: { ...editingBubble, id, name: bubbleFont.bubbles[id]?.name ?? editingBubble.name } },
    };
    useBubbleStore.getState().loadBubbleFont(nextFont);
    try {
      saveBubbleFont(nextFont);
    } catch {
      alert('Saving bubble font to browser storage failed.');
    }
    // Block now matches the preset — drop the per-instance override.
    setBlockBubble(editingBlock.id, undefined);
  }, [editingBlock, editingBubble, bubbleFont, setBlockBubble]);

  const onSaveAsNewPreset = useCallback(() => {
    if (!editingBlock || !editingBubble) return;
    const name = window.prompt('New preset name:', editingBubble.name || 'New bubble');
    if (!name) return;
    const id = sanitizePresetId(name);
    if (!id) return;
    if (bubbleFont.bubbles[id] && !window.confirm(`A preset "${id}" already exists. Overwrite?`)) {
      return;
    }
    const nextBubble: Bubble = { ...editingBubble, id, name };
    const nextFont: BubbleFont = {
      ...bubbleFont,
      bubbles: { ...bubbleFont.bubbles, [id]: nextBubble },
    };
    useBubbleStore.getState().loadBubbleFont(nextFont);
    try {
      saveBubbleFont(nextFont);
    } catch {
      alert('Saving bubble font to browser storage failed.');
    }
    // Re-point the block at the new preset and drop the per-instance
    // override (it's now the saved preset, identical content).
    updateBlock(editingBlock.id, { bubblePresetId: id });
    setBlockBubble(editingBlock.id, undefined);
  }, [editingBlock, editingBubble, bubbleFont, updateBlock, setBlockBubble]);

  const onResetToPreset = useCallback(() => {
    if (!editingBlock) return;
    setBlockBubble(editingBlock.id, undefined);
  }, [editingBlock, setBlockBubble]);

  // Full-screen takeover removed: bubble editing happens **in place** on
  // the page so the user keeps the rest of the page visible. The handle
  // overlay is drawn by `BlockOverlay` for the block whose id matches
  // `bubbleEditingBlockId`; the rich editing UI (layer list, Save / Save
  // As / Reset / Done) lives in the right inspector.

  return (
    <div
      className="mz-typesetter mz-typesetter--sift"
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* Outliner — page source + block list */}
      <MgLeftBar
        id="moritz.outliner"
        title="Page"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            style={{
              background: 'var(--mz-bg)',
              color: 'var(--mz-text)',
              border: '1px solid var(--mz-line)',
              padding: '6px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <MoritzLabel text="Load comic page" size={12} />
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
          <button onClick={onAddBlock}>
            <MoritzLabel text="Add text block" size={12} />
          </button>
          <Section title="Page">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
              <MoritzLabel text="Format" size={11} />
              <MoritzSelect
                value={pageFormatId}
                options={PAGE_FORMATS.map((f) => ({ value: f.id, label: f.name }))}
                onChange={setPageFormat}
              />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, marginTop: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  <MoritzLabel text="Safe area inset" size={11} />
                </span>
                <span style={{ color: 'var(--mz-text-mute)', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(border.inset)}px
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={120}
                step={1}
                value={border.inset}
                onChange={(e) => setBorder({ inset: parseFloat(e.target.value) })}
              />
            </label>
          </Section>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => exportPage(exportResolveFont, blocks, pageW, pageH, 'svg', bubbleFont)}
              disabled={blocks.length === 0}
              style={{ flex: 1 }}
            >
              <MoritzLabel text="Export SVG" size={12} />
            </button>
            <button
              onClick={() => exportPage(exportResolveFont, blocks, pageW, pageH, 'png', bubbleFont)}
              disabled={blocks.length === 0}
              style={{ flex: 1 }}
            >
              <MoritzLabel text="Export PNG" size={12} />
            </button>
          </div>
          <Section title="Objects">
            <TypeSetterCObjectOutliner
              input={cObjectInput}
              selection={cObjectSelection}
              onSelect={selectCObject}
            />
          </Section>
          {selected && (
            <Section title={isEditingSelected ? 'Edit bubble' : 'Block'}>
              <BlockInspector
                block={selected}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onDelete={() => deleteBlock(selected.id)}
                editing={
                  isEditingSelected && editingBubble
                    ? {
                        bubble: editingBubble,
                        layerId: editingLayerId,
                        presetId: selected.bubblePresetId ?? null,
                        dirty: !!selected.bubble,
                        selectLayer: selectBubbleEditingLayer,
                        updateBubble: (fn) =>
                          updateBlockBubble(selected.id, editingBubble, fn),
                        updateLayer: (layerId, fn) =>
                          updateBlockBubbleLayer(
                            selected.id,
                            editingBubble,
                            layerId,
                            fn,
                          ),
                        onSave: onSaveToPreset,
                        onSaveAs: onSaveAsNewPreset,
                        onReset: onResetToPreset,
                      }
                    : undefined
                }
              />
            </Section>
          )}
        </div>
      </MgLeftBar>

      {/* Stage — paper page sits directly on the workspace raster.
          No drop-shadowed mini-page-on-stage; the page itself IS the
          subject. The dashed inner rectangle is the safe area / live
          area (settable per page-format preset). */}
      <div
        className="mz-typesetter__bench"
        style={{ position: 'absolute', inset: 0 }}
      >
        <div
          ref={surfaceRef}
          className="mz-canvas mz-typesetter__stage"
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
          onPointerCancel={onSurfacePointerUp}
        >
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid var(--mz-line)',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--mz-text-mute)',
              zIndex: 2,
            }}
            >
              <button
              onClick={onFit}
              title="Fit page to view"
              style={{ padding: '0 6px', fontSize: 11 }}
            >
              <MoritzLabel text="Fit" size={11} />
            </button>
            <span>
              <MoritzLabel text="Zoom" size={11} />
            </span>
            <input
              type="range"
              min={0.05}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => onZoomSlider(parseFloat(e.target.value))}
              style={{ width: 120 }}
            />
            <span style={{ minWidth: 32, textAlign: 'right' }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <div
            ref={stageRef}
            className="mz-page mz-typesetter__page"
            style={{
              width: pageW * zoom,
              height: pageH * zoom,
              ...(pageImage
                ? { backgroundImage: `url(${pageImage})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
                : {}),
            }}
            onClick={(e) => {
              // Only deselect when the bare page is clicked. Block overlays
              // stop pointerdown propagation, but `click` is a separate event
              // that still bubbles, so without this guard every block click
              // selects-then-immediately-deselects.
              if (e.target === e.currentTarget) selectBlock(null);
            }}
          >
            {/* Safe-area guide */}
            {border.inset > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: border.inset * zoom,
                  top: border.inset * zoom,
                  width: Math.max(0, (pageW - border.inset * 2) * zoom),
                  height: Math.max(0, (pageH - border.inset * 2) * zoom),
                  border: `${border.stroke}px dashed var(--mz-line)`,
                  pointerEvents: 'none',
                  opacity: 0.6,
                }}
              />
            )}
            {blocks.map((b) => {
              const isEd =
                !!editingBlock && b.id === editingBlock.id && !!editingBubble;
              // Per-block font/style resolution (Principle 7: per-element
              // assignment). The block's own pickers win when set;
              // otherwise we fall back to the active globals exactly as
              // before, so blocks without an override behave identically.
              const blockFont = resolveBlockFont(b, baseFont);
              const blockStyle = resolveBlockStyle(b, style);
              const renderFont = fontWithOverrides(blockFont, blockStyle);
              return (
                <BlockOverlay
                  key={b.id}
                  block={b}
                  font={renderFont}
                  bubbleFont={bubbleFont}
                  zoom={zoom}
                  selected={b.id === selectedBlockId}
                  onSelect={() => selectBlock(b.id)}
                  onSelectLayer={(layerId) => {
                    selectBlock(b.id);
                    selectBubbleEditingLayer(layerId);
                  }}
                  onMove={(x, y) => updateBlock(b.id, { x, y })}
                  onTailMove={(tailX, tailY) =>
                    updateBlock(b.id, { tailX, tailY })
                  }
                  editing={
                    isEd && editingBubble && editingLayerId
                      ? {
                          bubble: editingBubble,
                          bubbleStyle: bubbleFont.style,
                          layerId: editingLayerId,
                          updateLayer: (layerId, fn) =>
                            updateBlockBubbleLayer(
                              b.id,
                              editingBubble,
                              layerId,
                              fn,
                            ),
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Attributes — style controls (identical position across modules) */}
      <MgRightBar
        id="moritz.attrs"
        title="Style"
      >
        <div className="mz-mod--stylesetter">
          <StyleControls
            style={style}
            setStyle={setStyleOverride}
            original={loadedStyleSettings}
          />
        </div>
      </MgRightBar>
    </div>
  );
}

// ---------- Block on the page -----------------------------------------------

/**
 * In-place spline-handle overlay for the active layer of a block's
 * bubble. **Visually identical to the BubbleSetter / GlyphSetter** —
 * both editors render through the same `StrokeOverlay` component, so
 * anchor squares, tangent handles, hover states and accent colours
 * stay in lock-step.
 *
 * Coordinate plumbing:
 *   - The block's render maps each glyph-source vertex `vp` to
 *     block-local (viewBox) px `(tx + vp.x*sx*s, ty + vp.y*sy*s)`,
 *     where `(sx, sy)` is the box-stretch and `s = layer.scale`.
 *     We mirror this rule by **pre-deforming the glyph** (multiply
 *     vertex coords by `(sx, sy)`) and wrapping with a uniform
 *     `translate(tx, ty) scale(s)`. That keeps anchor squares square
 *     and stroke widths stable under non-uniform bubble stretching.
 *   - Pointer drag: screen px → viewBox px (via getScreenCTM) →
 *     deformed-glyph coord (subtract `(tx,ty)`, divide by `s`) →
 *     source-glyph coord (divide by `(sx, sy)`). That's the input to
 *     `moveAnchor` / `moveHandle`, which work on the source glyph.
 *
 * Edits go through the `updateLayer` callback, which clones the
 * block's `bubble` from the preset on first write — so the user can
 * just select a block and start dragging.
 */
function BubbleHandles(props: {
  block: TextBlock;
  inner: { offsetX: number; offsetY: number; width: number; height: number };
  zoom: number;
  bubble: Bubble;
  bubbleStyle: Bubble extends never ? never : import('../../core/types.js').StyleSettings;
  layerId: string;
  selection: Selection;
  setSelection: (s: Selection) => void;
  updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
}): JSX.Element | null {
  const { block, inner, zoom, bubble, bubbleStyle, layerId, selection, setSelection, updateLayer } =
    props;
  const layer = bubble.layers.find((l) => l.id === layerId);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<
    | { kind: 'anchor'; strokeIdx: number; vIdx: number }
    | { kind: 'handle'; strokeIdx: number; vIdx: number; side: 'in' | 'out' }
    | { kind: 'normal'; strokeIdx: number; vIdx: number }
    | { kind: 'stroke'; strokeIdx: number; lastX: number; lastY: number }
    | null
  >(null);
  if (!layer) return null;

  const sx = bubble.box.w > 0 ? block.bubbleW / bubble.box.w : 1;
  const sy = bubble.box.h > 0 ? block.bubbleH / bubble.box.h : 1;
  const ax = bubble.box.w * layer.anchorX;
  const ay = bubble.box.h * layer.anchorY;
  const txSrc = ax + layer.offsetX - (layer.glyph.box.w * layer.scale) / 2;
  const tySrc = ay + layer.offsetY - (layer.glyph.box.h * layer.scale) / 2;
  const tx = txSrc * sx;
  const ty = tySrc * sy;
  const s = layer.scale;

  // Deformed copy of the glyph for handle rendering — same rule the
  // bubble renderer uses (`scaleGlyphVertices`). Stroke widths are not
  // touched, so the displayed anchor squares stay uniform under
  // non-uniform bubble stretching.
  const deformedGlyph = useMemo<Glyph>(() => {
    if (sx === 1 && sy === 1) return layer.glyph;
    const m: Affine = { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
    return {
      ...layer.glyph,
      strokes: layer.glyph.strokes.map((stk) => transformStroke(m, stk)),
    };
  }, [layer.glyph, sx, sy]);

  const gStyle = useMemo(
    () => effectiveStyleForGlyph(bubbleStyle, deformedGlyph),
    [bubbleStyle, deformedGlyph],
  );
  const defaultProfile: WidthProfile = gStyle.defaultWidth;

  // Convert client coords → glyph-source coords for the active layer.
  const toSrc = (clientX: number, clientY: number): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(inv);
    if (s === 0 || sx === 0 || sy === 0) return null;
    const xDef = (local.x - tx) / s;
    const yDef = (local.y - ty) / s;
    return { x: xDef / sx, y: yDef / sy };
  };

  const onAnchorPointerDown = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'anchor', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onHandlePointerDown = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
    side: 'in' | 'out',
  ) => {
    e.stopPropagation();
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'handle', strokeIdx, vIdx, side };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onStrokePointerDown = (e: React.PointerEvent, strokeIdx: number) => {
    e.stopPropagation();
    setSelection({ kind: 'stroke', strokeIdx });
    const p = toSrc(e.clientX, e.clientY);
    if (!p) return;
    dragRef.current = { kind: 'stroke', strokeIdx, lastX: p.x, lastY: p.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onNormalPointerDown = (
    e: React.PointerEvent,
    strokeIdx: number,
    vIdx: number,
  ) => {
    e.stopPropagation();
    // Shift+click clears the override (back to auto / connected to anchor),
    // mirroring the GlyphSetter / BubbleSetter editor behaviour.
    if (e.shiftKey) {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: clearNormalOverride(l.glyph, strokeIdx, vIdx),
      }));
      setSelection({ kind: 'anchor', strokeIdx, vIdx });
      return;
    }
    setSelection({ kind: 'anchor', strokeIdx, vIdx });
    dragRef.current = { kind: 'normal', strokeIdx, vIdx };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSrc(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'anchor') {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: moveAnchor(l.glyph, drag.strokeIdx, drag.vIdx, p),
      }));
    } else if (drag.kind === 'handle') {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: moveHandle(l.glyph, drag.strokeIdx, drag.vIdx, drag.side, p),
      }));
    } else if (drag.kind === 'stroke') {
      const dx = p.x - drag.lastX;
      const dy = p.y - drag.lastY;
      if (dx === 0 && dy === 0) return;
      drag.lastX = p.x;
      drag.lastY = p.y;
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: translateStroke(l.glyph, drag.strokeIdx, dx, dy),
      }));
    } else {
      updateLayer(layerId, (l) => ({
        ...l,
        glyph: setNormalOverride(l.glyph, drag.strokeIdx, drag.vIdx, p),
      }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  // The overlay SVG fills the block wrapper. Its viewBox is
  // identical to the block's inner SVG, so handles sit exactly on
  // top of the rendered ink. `pointerEvents: none` on the SVG +
  // `pointerEvents: auto` on individual handles (set inside
  // StrokeOverlay) means clicks on empty canvas pass through to the
  // block-drag handler in the parent.
  // `scale` is on-screen px per (deformed-)glyph-unit:
  //   1 viewBox unit = `zoom` screen px (block wrapper sizing) and
  //   1 deformed-glyph unit = `s` viewBox units (our <g scale>),
  //   so scale = zoom * s. StrokeOverlay sizes its anchor squares as
  //   8/scale glyph units, which renders to a constant 8 px on screen.
  const screenScale = zoom * s;
  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`${inner.offsetX} ${inner.offsetY} ${inner.width} ${inner.height}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* `pointer-events` inherits in SVG; the outer <svg> opts out so
          empty space falls through, but the handles need to opt back
          IN here so painted anchors/handles stay clickable (default
          `auto` means `visiblePainted`: only painted regions hit). */}
      <g transform={`translate(${tx} ${ty}) scale(${s})`} pointerEvents="auto">
        {deformedGlyph.strokes.map((stk, i) => (
          <StrokeOverlay
            key={stk.id}
            stroke={stk}
            strokeIdx={i}
            selection={selection}
            showAnchors
            scale={screenScale}
            profile={stk.width ?? defaultProfile}
            onStrokePointerDown={onStrokePointerDown}
            onAnchorPointerDown={onAnchorPointerDown}
            onHandlePointerDown={onHandlePointerDown}
            onNormalPointerDown={onNormalPointerDown}
          />
        ))}
      </g>
    </svg>
  );
}

/** Right-inspector panel shown while a block's bubble is being edited
 *  in place. Layer list (select / show / hide / remove / add) plus
 *  per-layer Add Anchor / Add Stroke / Flip H/V / Toggle Fill, plus
 *  Save / Save As / Reset. (No Done button — deselecting the block
 *  exits the editor.) */
function BubbleEditPanel(props: {
  bubble: Bubble;
  layerId: string | null;
  presetId: string | null;
  dirty: boolean;
  selectLayer: (id: string | null) => void;
  updateBubble: (fn: (b: Bubble) => Bubble) => void;
  updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onReset: () => void;
}): JSX.Element {
  const { bubble, layerId, updateBubble, updateLayer } = props;
  const layer = bubble.layers.find((l) => l.id === layerId) ?? null;
  const fillOn = !!layer && (layer.fill?.mode ?? 'none') !== 'none';
  const onAddLayer = () => {
    const id = `layer-${Math.random().toString(36).slice(2, 8)}`;
    const empty: BubbleLayer = {
      id,
      name: 'Layer',
      visible: true,
      anchorX: 0.5,
      anchorY: 0.5,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      glyph: { char: '', box: { w: bubble.box.w, h: bubble.box.h }, strokes: [] },
    };
    updateBubble((b) => ({ ...b, layers: [...b.layers, empty] }));
    props.selectLayer(id);
  };
  const onRemoveLayer = (id: string) => {
    updateBubble((b) => ({ ...b, layers: b.layers.filter((l) => l.id !== id) }));
    if (layerId === id) props.selectLayer(null);
  };
  const onToggleVisible = (id: string) =>
    updateLayer(id, (l) => ({ ...l, visible: !(l.visible ?? true) }));
  const onToggleFill = () => {
    if (!layer) return;
    updateLayer(layer.id, (l) => {
      const next = (l.fill?.mode ?? 'none') === 'none' ? 'paper' : 'none';
      return { ...l, fill: { ...(l.fill ?? { opacity: 1 }), mode: next } };
    });
  };
  const onFlipH = () => {
    if (!layer) return;
    const w = layer.glyph.box.w;
    updateLayer(layer.id, (l) => ({
      ...l,
      glyph: { ...l.glyph, strokes: l.glyph.strokes.map((s) => flipStroke(s, 'h', w)) },
    }));
  };
  const onFlipV = () => {
    if (!layer) return;
    const h = layer.glyph.box.h;
    updateLayer(layer.id, (l) => ({
      ...l,
      glyph: { ...l.glyph, strokes: l.glyph.strokes.map((s) => flipStroke(s, 'v', h)) },
    }));
  };
  const onAddStroke = () => {
    if (!layer) return;
    const w = layer.glyph.box.w;
    const h = layer.glyph.box.h;
    const id = `s-${Math.random().toString(36).slice(2, 8)}`;
    const v0: Vertex = {
      p: { x: w * 0.25, y: h * 0.5 },
      inHandle: { x: -w * 0.1, y: 0 },
      outHandle: { x: w * 0.1, y: 0 },
    };
    const v1: Vertex = {
      p: { x: w * 0.75, y: h * 0.5 },
      inHandle: { x: -w * 0.1, y: 0 },
      outHandle: { x: w * 0.1, y: 0 },
    };
    const newStroke: Stroke = { id, vertices: [v0, v1] };
    updateLayer(layer.id, (l) => ({
      ...l,
      glyph: { ...l.glyph, strokes: [...l.glyph.strokes, newStroke] },
    }));
  };
  const onAddAnchor = () => {
    if (!layer) return;
    updateLayer(layer.id, (l) => ({
      ...l,
      glyph: {
        ...l.glyph,
        strokes: l.glyph.strokes.map((s, idx) =>
          idx === 0 ? insertMidpointAnchor(s) : s,
        ),
      },
    }));
  };
  const onRemoveAnchor = () => {
    if (!layer) return;
    updateLayer(layer.id, (l) => ({
      ...l,
      glyph: {
        ...l.glyph,
        strokes: l.glyph.strokes.map((s) =>
          s.vertices.length > 2 ? { ...s, vertices: s.vertices.slice(0, -1) } : s,
        ),
      },
    }));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--mz-text-mute)',
          padding: '4px 6px',
          borderRadius: 4,
          background: 'var(--mz-panel-2)',
        }}
      >
        Editing in place — drag anchors &amp; handles on the page.
        {props.presetId ? <> Preset: <code>{props.presetId}</code>.</> : null}
        {props.dirty ? <> <em>Unsaved.</em></> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--mz-text-mute)',
          }}
        >
          <MoritzLabel text="Layers" size={11} />
        </div>
        {bubble.layers.map((l) => (
          <div
            key={l.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 4px',
              borderRadius: 3,
              background: l.id === layerId ? 'var(--mz-panel-2)' : 'transparent',
            }}
          >
            <button
              onClick={() => onToggleVisible(l.id)}
              title={(l.visible ?? true) ? 'Hide layer' : 'Show layer'}
              style={{ padding: '2px 6px', fontSize: 11, minWidth: 22 }}
            >
              {(l.visible ?? true) ? '\u25cf' : '\u25cb'}
            </button>
            <button
              onClick={() => props.selectLayer(l.id)}
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '2px 6px',
                fontSize: 12,
                fontWeight: l.id === layerId ? 600 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <MoritzLabel text={l.name || l.id} size={11} />
            </button>
            <button
              onClick={() => onRemoveLayer(l.id)}
              disabled={bubble.layers.length <= 1}
              title="Remove layer"
              className="mz-btn--warn"
              style={{ padding: '2px 6px', fontSize: 11 }}
            >
              ×
            </button>
          </div>
        ))}
        <button onClick={onAddLayer} style={{ padding: '4px 8px', fontSize: 12 }}>
          <MoritzLabel text="Add layer" size={12} />
        </button>
      </div>
      {layer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--mz-text-mute)',
            }}
          >
            <MoritzLabel text="Active layer" size={11} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button onClick={onAddStroke} style={{ padding: '4px 8px', fontSize: 12 }}>
              <MoritzLabel text="Add stroke" size={12} />
            </button>
            <button onClick={onAddAnchor} style={{ padding: '4px 8px', fontSize: 12 }}>
              <MoritzLabel text="Add anchor" size={12} />
            </button>
            <button onClick={onRemoveAnchor} style={{ padding: '4px 8px', fontSize: 12 }}>
              <MoritzLabel text="Remove anchor" size={12} />
            </button>
            <button onClick={onFlipH} style={{ padding: '4px 8px', fontSize: 12 }}>
              <MoritzLabel text="Flip H" size={12} />
            </button>
            <button onClick={onFlipV} style={{ padding: '4px 8px', fontSize: 12 }}>
              <MoritzLabel text="Flip V" size={12} />
            </button>
            <button
              onClick={onToggleFill}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                background: fillOn ? 'var(--mz-accent)' : undefined,
                color: fillOn ? 'var(--mz-bg)' : undefined,
              }}
            >
              <MoritzLabel text={fillOn ? 'Fill on' : 'Fill off'} size={12} />
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={props.onSave}
          disabled={!props.presetId || !props.dirty}
          style={{ padding: '6px 8px' }}
        >
          <MoritzLabel text="Save to preset" size={12} />
        </button>
        <button onClick={props.onSaveAs} style={{ padding: '6px 8px' }}>
          <MoritzLabel text="Save as new preset" size={12} />
        </button>
        <button
          onClick={props.onReset}
          disabled={!props.dirty}
          className="mz-btn--warn"
          style={{ padding: '6px 8px' }}
        >
          <MoritzLabel text="Reset to preset" size={12} />
        </button>
      </div>
    </div>
  );
}

/** Mirror a stroke's vertices around the glyph centre on the given axis. */
function flipStroke(s: Stroke, axis: 'h' | 'v', span: number): Stroke {
  return {
    ...s,
    vertices: s.vertices.map((v) =>
      axis === 'h'
        ? {
            p: { x: span - v.p.x, y: v.p.y },
            inHandle: { x: -v.inHandle.x, y: v.inHandle.y },
            outHandle: { x: -v.outHandle.x, y: v.outHandle.y },
          }
        : {
            p: { x: v.p.x, y: span - v.p.y },
            inHandle: { x: v.inHandle.x, y: -v.inHandle.y },
            outHandle: { x: v.outHandle.x, y: -v.outHandle.y },
          },
    ),
  };
}

/** Insert a new anchor at the midpoint of a stroke's last cubic
 *  segment via de Casteljau split at t=0.5 (preserves the curve). */
function insertMidpointAnchor(s: Stroke): Stroke {
  const n = s.vertices.length;
  if (n < 2) return s;
  const a = s.vertices[n - 2]!;
  const b = s.vertices[n - 1]!;
  const P0 = a.p;
  const P1 = { x: a.p.x + a.outHandle.x, y: a.p.y + a.outHandle.y };
  const P2 = { x: b.p.x + b.inHandle.x, y: b.p.y + b.inHandle.y };
  const P3 = b.p;
  const mid = (u: Vec2, v: Vec2): Vec2 => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
  const M01 = mid(P0, P1);
  const M12 = mid(P1, P2);
  const M23 = mid(P2, P3);
  const M012 = mid(M01, M12);
  const M123 = mid(M12, M23);
  const Mc = mid(M012, M123);
  const newA = { ...a, outHandle: { x: M01.x - a.p.x, y: M01.y - a.p.y } };
  const newM: Vertex = {
    p: Mc,
    inHandle: { x: M012.x - Mc.x, y: M012.y - Mc.y },
    outHandle: { x: M123.x - Mc.x, y: M123.y - Mc.y },
  };
  const newB = { ...b, inHandle: { x: M23.x - b.p.x, y: M23.y - b.p.y } };
  return { ...s, vertices: [...s.vertices.slice(0, n - 2), newA, newM, newB] };
}

/** Lower-case, dash-separated, alphanum-only id suitable for BubbleFont keys. */
function sanitizePresetId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function BlockOverlay(props: {
  block: TextBlock;
  font: Font;
  bubbleFont: BubbleFont;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onSelectLayer: (layerId: string) => void;
  onMove: (x: number, y: number) => void;
  onTailMove: (tailX: number, tailY: number) => void;
  /** When set, the bubble is in live in-place edit mode: the overlay
   *  draws draggable anchors + tangent handles for the active layer's
   *  strokes, sized to constant screen pixels regardless of zoom. The
   *  rest of the page (other blocks, page background) keeps rendering
   *  normally. */
  editing?: {
    bubble: Bubble;
    bubbleStyle: import('../../core/types.js').StyleSettings;
    layerId: string;
    updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
  };
}): JSX.Element {
  const { block, font, bubbleFont, zoom, editing } = props;
  const tailRef = useRef<boolean>(false);
  // Per-block spline selection (for the active layer). Reset on layer
  // change so we don't end up highlighting a stale anchor index.
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const lastLayerIdRef = useRef<string | null>(null);
  if (editing && lastLayerIdRef.current !== editing.layerId) {
    lastLayerIdRef.current = editing.layerId;
    if (selection.kind !== 'none') setSelection({ kind: 'none' });
  }

  // Build the inner SVG fragment (bubble + text) directly so we can
  // host it inside a React-managed <svg>. Going through React for the
  // SVG element lets us attach a real onClick + control pointer-events
  // at the SVG level — `dangerouslySetInnerHTML` on a wrapping div
  // proved unreliable for hit-testing because the wrapper had to be
  // pointer-events: none for click-through to work, which suppresses
  // SVG hit-testing in some browsers.
  const pieces = useMemo(
    () => buildBlockPieces(font, block, bubbleFont),
    [font, block, bubbleFont],
  );
  const innerW = Math.max(1, pieces.maxX - pieces.minX);
  const innerH = Math.max(1, pieces.maxY - pieces.minY);
  // Match the legacy `inner.{offsetX,offsetY,width,height}` shape so
  // the surviving handle components keep working unchanged.
  const inner = useMemo(
    () => ({
      offsetX: pieces.minX,
      offsetY: pieces.minY,
      width: innerW,
      height: innerH,
    }),
    [pieces.minX, pieces.minY, innerW, innerH],
  );

  // The inner SVG is in image-space units; `zoom` scales the wrapper.
  const w = inner.width;
  const h = inner.height;

  // The wrapper itself is non-interactive — clicks on transparent
  // bubble/page pixels fall straight through to the page below
  // (Principle 6). The SVG element is also pointer-events:none; only
  // its `<g>` children tagged with `pointer-events="visiblePainted"`
  // are real hit targets, so transparent space inside the SVG bounding
  // box still passes through. Click delegation runs on bubbled events.
  return (
    <div
      className={`mz-block${props.selected ? ' mz-block--selected' : ''}`}
      style={{
        position: 'absolute',
        left: (block.x + inner.offsetX) * zoom,
        top: (block.y + inner.offsetY) * zoom,
        width: w * zoom,
        height: h * zoom,
        pointerEvents: 'none',
        outline: props.selected ? '1px dashed var(--mz-accent)' : 'none',
      }}
      onClick={(e) => {
        const target = e.target as Element | null;
        if (!target) return;
        const layerHit = target.closest('[data-layer-id]');
        if (layerHit) {
          const id = layerHit.getAttribute('data-layer-id');
          if (id) {
            e.stopPropagation();
            props.onSelectLayer(id);
            return;
          }
        }
        const textHit = target.closest('[data-text-run]');
        if (textHit) {
          e.stopPropagation();
          props.onSelect();
          return;
        }
      }}
    >
      <svg
        width={w * zoom}
        height={h * zoom}
        viewBox={`${pieces.minX} ${pieces.minY} ${innerW} ${innerH}`}
        overflow="visible"
        // Root SVG is inert; only descendants with explicit
        // pointer-events become hit targets.
        pointerEvents="none"
        style={{ display: 'block' }}
        dangerouslySetInnerHTML={{ __html: pieces.body }}
      />
      <BlockAnchorGizmo
        block={block}
        zoom={zoom}
        inner={inner}
        selected={props.selected}
        onSelect={props.onSelect}
        onMove={props.onMove}
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
      {editing && (
        <BubbleHandles
          block={block}
          inner={inner}
          zoom={zoom}
          bubble={editing.bubble}
          bubbleStyle={editing.bubbleStyle}
          layerId={editing.layerId}
          selection={selection}
          setSelection={setSelection}
          updateLayer={editing.updateLayer}
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
        background: 'var(--mz-bg)',
        border: '2px solid var(--mz-accent)',
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

/**
 * Tiny anchor gizmo at the block's (x, y) origin — the *only* hit
 * target that selects the block and starts a move-drag. The visual is
 * deliberately small (6 px dot) but the hit area is larger (18 px
 * transparent square) to stay easy to grab. Sits inside the block
 * wrapper but re-enables `pointerEvents` for itself; the rest of the
 * wrapper is `pointer-events: none` so clicks on the bubble shape pass
 * through to whatever is below (other blocks, page → deselect).
 */
function BlockAnchorGizmo(props: {
  block: TextBlock;
  zoom: number;
  inner: { offsetX: number; offsetY: number };
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}): JSX.Element {
  const { block, zoom, inner } = props;
  // (block.x, block.y) maps to the wrapper-local point
  // (-inner.offsetX, -inner.offsetY) * zoom because the wrapper is
  // positioned at (block.x + inner.offsetX, block.y + inner.offsetY).
  const left = -inner.offsetX * zoom;
  const top = -inner.offsetY * zoom;
  const moveRef = useRef<{ lastX: number; lastY: number } | null>(null);
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
  const HIT = 18;
  const DOT = 6;
  return (
    <div
      style={{
        position: 'absolute',
        left: left - HIT / 2,
        top: top - HIT / 2,
        width: HIT,
        height: HIT,
        cursor: 'move',
        pointerEvents: 'auto',
        // Keep the hit-target invisible; the centred dot is the visual.
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to move; click to select"
    >
      <div
        style={{
          width: DOT,
          height: DOT,
          borderRadius: '50%',
          background: props.selected ? 'var(--mz-accent)' : 'var(--mz-bg)',
          border: '1.5px solid var(--mz-accent)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  );
}

function TypeSetterCObjectOutliner(props: {
  input: TypeSetterCObjectInput;
  selection: {
    readonly root: CObject | null;
    readonly selected: CObject | null;
  };
  onSelect: (id: string) => void;
}): JSX.Element {
  const root = props.selection.root;
  if (!root) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--mz-text-mute)' }}>
        <MoritzLabel text="No page objects" size={12} />
      </p>
    );
  }
  return (
    <MgOutliner
      nodes={[typeSetterCObjectToTreeNode(props.input, root)]}
      selectedId={props.selection.selected?.id ?? null}
      onSelect={props.onSelect}
    />
  );
}

function typeSetterCObjectToTreeNode(input: TypeSetterCObjectInput, node: CObject): MgTreeNode {
  const meta = moritzTypeSetterCObjectMetaFromId(input, node.id);
  return {
    id: node.id,
    label: meta?.label ?? cObjectFallbackLabel(node.id),
    kind: meta?.role ?? node.kind,
    selected: node.selected === true,
    tone:
      meta?.role === 'page'
        ? 'relevant'
        : meta?.role === 'bubbleLayer'
          ? 'generate'
          : 'neutral',
    importance: node.selected ? 5 : meta?.role === 'page' ? 3 : 1,
    ...(node.children.length > 0
      ? { children: node.children.map((child) => typeSetterCObjectToTreeNode(input, child)) }
      : {}),
  };
}

function cObjectFallbackLabel(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1] || id;
}

function BlockInspector(props: {
  block: TextBlock;
  onChange: (p: Partial<TextBlock>) => void;
  onDelete: () => void;
  /** When set, replaces the standard inspector body with the in-place
   *  bubble editor panel (layer list + edit ops + Save/SaveAs/Reset). */
  editing?: {
    bubble: Bubble;
    layerId: string | null;
    presetId: string | null;
    dirty: boolean;
    selectLayer: (id: string | null) => void;
    updateBubble: (fn: (b: Bubble) => Bubble) => void;
    updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
    onSave: () => void;
    onSaveAs: () => void;
    onReset: () => void;
  };
}): JSX.Element {
  const { block, onChange, editing } = props;
  const bubbleFont = useBubbleStore((s) => s.font);
  if (editing) {
    return (
      <BubbleEditPanel
        bubble={editing.bubble}
        layerId={editing.layerId}
        presetId={editing.presetId}
        dirty={editing.dirty}
        selectLayer={editing.selectLayer}
        updateBubble={editing.updateBubble}
        updateLayer={editing.updateLayer}
        onSave={editing.onSave}
        onSaveAs={editing.onSaveAs}
        onReset={editing.onReset}
      />
    );
  }
  // Encoded as `${setId}::${bubbleIdx}` so a single menu can express
  // "pick a set + a bubble within it" without React state of its own.
  const onPickPreset = (encoded: string) => {
    if (!encoded) return;
    const [setId, idxStr] = encoded.split('::');
    const set = textPresetSets.find((s) => s.id === setId);
    const bubble = set?.bubbles[Number(idxStr)];
    if (bubble) onChange({ text: bubble.text });
  };
  const presetTextOptions = [
    { value: '', label: 'load preset' },
    ...textPresetSets.flatMap((set) => [
      { value: `set:${set.id}`, label: set.name, disabled: true },
      ...set.bubbles.map((b, i) => ({
        value: `${set.id}::${i}`,
        label: b.label,
      })),
    ]),
  ];
  const fontOptions = [
    { value: '', label: 'Active font' },
    ...builtInFonts.map((f) => ({ value: f.id, label: f.name })),
  ];
  const styleOptions = [
    { value: '', label: 'Active style' },
    ...builtInStyles.map((s) => ({ value: s.id, label: s.name })),
  ];
  const bubbleValue =
    block.shape === 'preset' && block.bubblePresetId
      ? `preset:${block.bubblePresetId}`
      : block.shape === 'none'
        ? 'none'
        : (() => {
            const aliased = LEGACY_SHAPE_TO_PRESET[block.shape] ?? block.shape;
            return bubbleFont.bubbles[aliased]
              ? `preset:${aliased}`
              : 'none';
          })();
  const bubbleOptions = [
    { value: 'none', label: 'None text only' },
    ...Object.values(bubbleFont.bubbles).map((b) => ({
      value: `preset:${b.id}`,
      label: b.name,
    })),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>
          <MoritzLabel text="Preset text" size={11} />
        </span>
        <MoritzSelect
          value=""
          options={presetTextOptions}
          onChange={onPickPreset}
        />
      </div>
      <label style={{ display: 'flex', flexDirection: 'column' }}>
        <MoritzLabel text="Text" size={11} />
        <textarea
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          style={{ fontSize: 14, padding: 4 }}
        />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>
          <MoritzLabel text="Font" size={11} />
        </span>
        <MoritzSelect
          value={block.fontId ?? ''}
          options={fontOptions}
          onChange={(value) => onChange({ fontId: value || undefined })}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>
          <MoritzLabel text="Style" size={11} />
        </span>
        <MoritzSelect
          value={block.styleId ?? ''}
          options={styleOptions}
          onChange={(value) => onChange({ styleId: value || undefined })}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <MoritzLabel text={`Bubble from ${bubbleFont.name}`} size={11} />
        <MoritzSelect
          value={bubbleValue}
          options={bubbleOptions}
          onChange={(value) => {
            if (value === 'none') {
              onChange({ shape: 'none', bubblePresetId: undefined });
            } else if (value.startsWith('preset:')) {
              onChange({ shape: 'preset', bubblePresetId: value.slice(7) });
            }
          }}
        />
      </div>
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
      <button onClick={props.onDelete} className="mz-btn--warn" style={{ marginTop: 12 }}>
        <MoritzLabel text="Delete block" size={12} />
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
        <span>
          <MoritzLabel text={props.label} size={11} />
        </span>
        <span style={{ color: 'var(--mz-text-mute)', fontVariantNumeric: 'tabular-nums' }}>
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

function buildBlockPieces(
  font: Font,
  block: TextBlock,
  bubbleFont: BubbleFont,
): BlockPieces {
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
  if (block.shape === 'preset') {
    // Per-block instance bubble (cloned from the preset on first edit)
    // takes precedence over the preset library lookup. This is what
    // makes the "Edit bubble" flow non-destructive to the BubbleFont.
    const preset =
      block.bubble ??
      (block.bubblePresetId
        ? bubbleFont.bubbles[block.bubblePresetId]
        : undefined);
    if (preset) {
      const frag = renderBubbleToSvgFragment(
        preset,
        bubbleFont.style,
        block.bubbleW,
        block.bubbleH,
      );
      parts.push(frag.body);
      minX = Math.min(0, frag.minX);
      minY = Math.min(0, frag.minY);
      maxX = Math.max(block.bubbleW, frag.maxX);
      maxY = Math.max(block.bubbleH, frag.maxY);
    } else {
      // Unknown preset id (e.g. user switched BubbleFont) — fall back
      // to the bubble box outline so the block is still visible.
      parts.push(
        `<rect x="0" y="0" width="${fmt(block.bubbleW)}" height="${fmt(block.bubbleH)}" fill="white" stroke="black" stroke-width="${fmt(block.bubbleStroke)}" />`,
      );
      maxX = block.bubbleW;
      maxY = block.bubbleH;
    }
  } else if (block.shape !== 'none') {
    // Legacy shape values ('speech'/'cloud'/'rect') from older pages:
    // try to resolve to a matching preset in the active BubbleFont so
    // the user's chosen artwork is what shows up. If the active font
    // doesn't contain that preset, fall back to the original generic
    // polygon so nothing disappears.
    const aliased =
      LEGACY_SHAPE_TO_PRESET[block.shape] ?? block.shape;
    const preset = bubbleFont.bubbles[aliased];
    if (preset) {
      const frag = renderBubbleToSvgFragment(
        preset,
        bubbleFont.style,
        block.bubbleW,
        block.bubbleH,
      );
      parts.push(frag.body);
      minX = Math.min(0, frag.minX);
      minY = Math.min(0, frag.minY);
      maxX = Math.max(block.bubbleW, frag.maxX);
      maxY = Math.max(block.bubbleH, frag.maxY);
    } else {
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
    `<g data-text-run="0" pointer-events="visiblePainted" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(scale)})">`,
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

// ---------- Page export -----------------------------------------------------

/**
 * Produce a single SVG (or PNG) of all text blocks + bubbles, positioned in
 * page space. The page image itself is intentionally NOT included — exports
 * are transparent overlays meant to be composited over the original artwork.
 *
 * `resolveFont` is called per block so per-block font/style picks
 * (Principle 7) survive into the export. Callers without per-block
 * overrides pass `() => globalFont`.
 */
function buildPageOverlaySvg(
  resolveFont: (block: TextBlock) => Font,
  blocks: readonly TextBlock[],
  pageW: number,
  pageH: number,
  bubbleFont: BubbleFont,
): string {
  const groups = blocks.map((b) => {
    const pieces = buildBlockPieces(resolveFont(b), b, bubbleFont);
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
  resolveFont: (block: TextBlock) => Font,
  blocks: readonly TextBlock[],
  pageW: number,
  pageH: number,
  format: 'svg' | 'png',
  bubbleFont: BubbleFont,
): Promise<void> {
  const svg = buildPageOverlaySvg(resolveFont, blocks, pageW, pageH, bubbleFont);
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
