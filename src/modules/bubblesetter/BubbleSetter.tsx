/**
 * BubbleSetter — preset library editor for speech bubbles.
 *
 * Per the design pivot: bubbles are *exactly* the same as glyphs. Each
 * BubbleLayer carries a Glyph, and we want the artist to edit those
 * strokes with the full GlyphSetter spline editor (anchors, handles,
 * +Stroke / +Anchor / Flip H/V, view options, the lot). The only thing
 * a bubble adds on top is a paper-white **Fill** behind its strokes.
 *
 * Layout:
 *   - Left drawer  : bubble grid + layer list for the selected bubble.
 *   - Centre       : `<GlyphEditor>` bound to the selected layer's glyph,
 *                    so the bubble editor looks and behaves identically
 *                    to the GlyphSetter, plus an extra "Fill" toolbar
 *                    button that toggles `layer.fill.mode` between
 *                    `'paper'` and `'none'`.
 *   - Right drawer : standard `<StyleControls>`, same as everywhere.
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAppStore } from '../../state/store.js';
import { useBubbleStore } from '../../state/bubbleStore.js';
import { outlineStroke, effectiveStyleForGlyph } from '../../core/stroke.js';
import { fillLoopsForStrokes, loopsToPath } from '../../core/bubbleFill.js';
import { GlyphEditor, SettingsPanel } from '../glyphsetter/GlyphSetter.js';
import { Section } from '../stylesetter/StyleControls.js';
import { StyleControls } from '../stylesetter/StyleControls.js';
import { textPresetSets } from '../../data/textPresets.js';
import {
  presetKey,
  useTextPresetsStore,
} from '../../state/textPresetsStore.js';
import type {
  Bubble,
  BubbleLayer,
  Font,
  Glyph,
  StyleSettings,
  Vec2,
} from '../../core/types.js';

/**
 * Editing target consumed by the BubbleSetter editor (LayerList,
 * PreviewTextPanel, the GlyphEditor wiring). When provided via
 * `BubbleEditingContext`, it overrides the default bubbleStore-bound
 * editing target. The TypeSetter wraps the editor in a context value
 * pointing at a per-block bubble snapshot so the same UI can edit
 * either the BubbleFont's library presets or a single block's instance.
 */
export type BubbleEditingTarget = {
  bubble: Bubble | null;
  selectedLayerId: string | null;
  selectLayer: (id: string | null) => void;
  updateBubble: (fn: (b: Bubble) => Bubble) => void;
  updateLayer: (layerId: string, fn: (l: BubbleLayer) => BubbleLayer) => void;
  removeLayer: (layerId: string) => void;
  addLayer: (layer: BubbleLayer) => void;
};

export const BubbleEditingContext = createContext<BubbleEditingTarget | null>(null);

/** Resolves to the provided context, or a bubbleStore-backed fallback. */
function useBubbleEditing(): BubbleEditingTarget {
  const ctx = useContext(BubbleEditingContext);
  const storeBubble = useBubbleStore((s) => s.font.bubbles[s.selectedBubble] ?? null);
  const storeSelLayer = useBubbleStore((s) => s.selectedLayer);
  const storeSelectLayer = useBubbleStore((s) => s.selectLayer);
  const storeUpdateSelected = useBubbleStore((s) => s.updateSelectedBubble);
  const storeUpdateLayer = useBubbleStore((s) => s.updateLayer);
  const storeRemoveLayer = useBubbleStore((s) => s.removeLayer);
  const storeAddLayer = useBubbleStore((s) => s.addLayer);
  const storeBubbleId = storeBubble?.id ?? null;
  const fallback = useMemo<BubbleEditingTarget>(
    () => ({
      bubble: storeBubble,
      selectedLayerId: storeSelLayer,
      selectLayer: storeSelectLayer,
      updateBubble: storeUpdateSelected,
      updateLayer: (layerId, fn) => {
        if (!storeBubbleId) return;
        storeUpdateLayer(storeBubbleId, layerId, fn);
      },
      removeLayer: (layerId) => {
        if (!storeBubbleId) return;
        storeRemoveLayer(storeBubbleId, layerId);
      },
      addLayer: (layer) => {
        if (!storeBubbleId) return;
        storeAddLayer(storeBubbleId, layer);
      },
    }),
    [
      storeBubble,
      storeSelLayer,
      storeSelectLayer,
      storeUpdateSelected,
      storeUpdateLayer,
      storeRemoveLayer,
      storeAddLayer,
      storeBubbleId,
    ],
  );
  return ctx ?? fallback;
}

export function BubbleSetter(props: {
  /** When true, hides the bubble grid (left drawer) and the bubble-font
   *  Style Controls drawer (right drawer). Used by the TypeSetter when
   *  the editor is embedded in-place to edit a single block's bubble. */
  readonly embedded?: boolean;
  /** Optional extra UI shown at the bottom of the left drawer (only
   *  consulted in embedded mode — host adds Save / Save-As / Reset etc). */
  readonly leftDrawerExtras?: React.ReactNode;
  /** Optional extra UI shown at the bottom of the right drawer in
   *  embedded mode. */
  readonly rightDrawerExtras?: React.ReactNode;
}): JSX.Element {
  const editing = useBubbleEditing();
  const bubble = editing.bubble;
  const selectedLayerId = editing.selectedLayerId;
  const selectLayer = editing.selectLayer;
  const updateLayer = editing.updateLayer;
  // Standalone-mode store accesses (only used when not embedded).
  const standaloneFont = useBubbleStore((s) => s.font);
  const standaloneSelectedId = useBubbleStore((s) => s.selectedBubble);
  const standaloneSelectBubble = useBubbleStore((s) => s.selectBubble);

  // Reuse the global Style + GlyphView so the bubble editor is
  // visually and behaviourally identical to the GlyphSetter.
  const style = useAppStore((s) => s.style);
  const setStyleOverride = useAppStore((s) => s.setStyleOverride);
  const loadedStyleSettings = useAppStore((s) => s.loadedStyleSettings);
  const glyphView = useAppStore((s) => s.glyphView);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  // Bubble-specific overrides for the GlyphEditor's view: a different
  // default zoom (so whole paragraphs fit inside a bubble) plus its own
  // pan offset, kept separate from the GlyphSetter's. The other view
  // flags (showAnchors, refFont, guides, â€¦) are still shared.
  const bubbleView = useBubbleStore((s) => s.view);
  const setBubbleView = useBubbleStore((s) => s.setView);
  const editorView = useMemo(
    () => ({
      ...glyphView,
      editorScale: bubbleView.editorScale,
      panX: bubbleView.panX,
      panY: bubbleView.panY,
      // Lined-paper grid: ON by default in the bubble editor so the
      // artist can judge where text lines sit inside the bubble.
      showLineGrid: true,
      fillOpacity: bubbleView.fillOpacity ?? 1,
      strokeOpacity: bubbleView.strokeOpacity ?? 1,
    }),
    [glyphView, bubbleView],
  );
  const setEditorView = useCallback(
    (patch: Partial<typeof editorView>): void => {
      const bubblePatch: Partial<typeof bubbleView> = {};
      const glyphPatch: Partial<typeof glyphView> = {};
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        if (
          k === 'editorScale' ||
          k === 'panX' ||
          k === 'panY' ||
          k === 'fillOpacity' ||
          k === 'strokeOpacity'
        ) {
          (bubblePatch as Record<string, unknown>)[k] = patch[k];
        } else {
          (glyphPatch as Record<string, unknown>)[k] = patch[k];
        }
      }
      if (Object.keys(bubblePatch).length > 0) setBubbleView(bubblePatch);
      if (Object.keys(glyphPatch).length > 0) setGlyphView(glyphPatch);
    },
    [setBubbleView, setGlyphView, glyphView, bubbleView],
  );

  const layer =
    bubble?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // Synthetic Font wrapping just the selected layer so GlyphEditor can
  // render it. The editor only reads `font.style` from this object.
  const editorFont: Font | null = useMemo(() => {
    if (!bubble || !layer) return null;
    return {
      id: bubble.id,
      name: bubble.name,
      style,
      glyphs: { [layer.id]: layer.glyph },
    };
  }, [bubble, layer, style]);

  const onGlyphChange = useCallback(
    (fn: (g: Glyph) => Glyph): void => {
      if (!bubble || !layer) return;
      updateLayer(layer.id, (l) => ({ ...l, glyph: fn(l.glyph) }));
    },
    [bubble, layer, updateLayer],
  );
    // (stray lines removed)
  // coordinates**. Every layer renders identically (same fill, same
  // ink stroke as in the glyph editor); the active layer is identified
  // only by the GlyphEditor's debug overlays drawn on top (anchors,
  // handles, fill-preview, borders, triangulation, â€¦). The GlyphEditor
  // is in world-space mode (see `world` prop below), so the underlay
  // is anchored to the canvas regardless of which layer is selected â€”
  // no jumping when switching layers.
  const underlay = useMemo(() => {
    if (!bubble || !layer) return null;
    // Constant pixel weight regardless of zoom: 1 px / worldS units.
    // We don't have worldS here, so derive from the editor scale.
    const lineW = 1 / bubbleView.editorScale;
    // Render every visible layer in the underlay. For the active
    // layer we suppress the stroke render (GlyphEditor draws those on
    // top at full opacity, and double-stroking made it visibly denser
    // than its siblings). The fill is still drawn here so the active
    // layer's paper-white interior remains visible.
    const visibleLayers = bubble.layers.filter((l) => l.visible !== false);
    return (
      <g>
        {/* Bubble box outline (in bubble coords) */}
        <rect
          x={0}
          y={0}
          width={bubble.box.w}
          height={bubble.box.h}
          fill="none"
          stroke="var(--mz-line)"
          strokeOpacity={0.7}
          strokeDasharray={`${4 * lineW} ${4 * lineW}`}
          strokeWidth={lineW}
        />
        {/* All visible layers, rendered identically. The currently-
            edited layer is *also* drawn by the GlyphEditor on top â€”
            the two renders coincide, so the result is one consistent
            look across the whole bubble. Click any layer's painted
            artwork to switch the active layer. */}
        <g>
          {visibleLayers.map((ol) => (
            <UnderlayLayer
              key={ol.id}
              layer={ol}
              style={style}
              bubble={bubble}
              fillOpacity={editorView.fillOpacity}
              strokeOpacity={editorView.strokeOpacity}
              hideStrokes={ol.id === layer.id}
              onSelect={ol.id === layer.id ? undefined : () => selectLayer(ol.id)}
            />
          ))}
        </g>
        {/* Dummy text floating inside the bubble box */}
        {bubble.dummyText && (
          <DummyTextOverlay
            text={bubble.dummyText}
            boxW={bubble.box.w}
            boxH={bubble.box.h}
          />
        )}
      </g>
    );
  }, [bubble, layer, style, bubbleView.editorScale, selectLayer, editorView.fillOpacity, editorView.strokeOpacity]);

  const toggleFill = useCallback((): void => {
    if (!bubble || !layer) return;
    updateLayer(layer.id, (l) => {
      const current = l.fill?.mode ?? 'none';
      const nextMode = current === 'none' ? 'paper' : 'none';
      return {
        ...l,
        fill: { ...(l.fill ?? { opacity: 1 }), mode: nextMode },
      };
    });
  }, [bubble, layer, updateLayer]);

  const fillOn = !!layer && (layer.fill?.mode ?? 'none') !== 'none';
  const fillButton = layer ? (
    <button
      onClick={toggleFill}
      title="Toggle paper-white fill behind this layer's strokes (computed from the centerlines)."
      style={
        fillOn
          ? {
              background: 'var(--mz-accent)',
              color: 'var(--mz-paper)',
              borderColor: 'var(--mz-accent)',
            }
          : undefined
      }
    >
      Fill
    </button>
  ) : null;

  return (
    <div className="mz-workbench mz-bubblesetter">
      <div className="mz-workbench__drawer mz-workbench__drawer--left">
        <div
          className="mz-workbench__drawer-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}
        >
          {!props.embedded && (
            <BubbleGrid
              bubbles={Object.values(standaloneFont.bubbles)}
              selected={standaloneSelectedId}
              onSelect={standaloneSelectBubble}
              style={style}
            />
          )}
          {bubble && <LayerList bubble={bubble} />}
          {bubble && <PreviewTextPanel />}
          {props.leftDrawerExtras}
          {/* Reuse the GlyphSetter's View settings (anchors, fill
              preview, debug overlays, triangulation, splinesâ€¦). The
              glyph-only entries (other glyphs, reference font, guides)
              are hidden via `bubbleMode`. The bubble editor has its
              own grid system (lined-paper) so we don't need them. */}
          <SettingsPanel
            view={editorView}
            setView={setEditorView}
            setFontGuides={() => {
              /* noop in bubble mode â€” guides section is hidden */
            }}
            bubbleMode
          />
        </div>
      </div>
      <div className="mz-workbench__bench mz-glyphsetter__editor">
        {bubble && layer && editorFont ? (
          <GlyphEditor
            char={layer.id}
            glyph={layer.glyph}
            onChange={onGlyphChange}
            view={editorView}
            setView={setEditorView}
            font={editorFont}
            extraToolbar={fillButton}
            world={{
              box: { w: bubble.box.w, h: bubble.box.h },
              ...layerTransform(bubble, layer),
            }}
            {...(underlay ? { underlay } : {})}
          />
        ) : (
          <p style={{ padding: 16 }}>
            {bubble ? 'No layer selected.' : 'No bubble selected.'}
          </p>
        )}
      </div>
      {!props.embedded && (
        <div className="mz-workbench__drawer mz-workbench__drawer--right mz-mod--stylesetter">
          <div className="mz-workbench__drawer-body">
            <StyleControls
              style={style}
              setStyle={setStyleOverride}
              {...(loadedStyleSettings ? { original: loadedStyleSettings } : {})}
            />
          </div>
        </div>
      )}
      {props.embedded && props.rightDrawerExtras && (
        <div className="mz-workbench__drawer mz-workbench__drawer--right">
          <div className="mz-workbench__drawer-body">
            {props.rightDrawerExtras}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Bubble grid (left drawer) --------------------------------------

const GRID_PX_PER_UNIT = 0.6;

function BubbleGrid(props: {
  bubbles: readonly Bubble[];
  selected: string;
  onSelect: (id: string) => void;
  style: StyleSettings;
}): JSX.Element {
  return (
    <div
      className="mz-bubble-grid"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
    >
      {props.bubbles.map((b) => {
        const active = b.id === props.selected;
        const w = b.box.w * GRID_PX_PER_UNIT;
        const h = b.box.h * GRID_PX_PER_UNIT;
        return (
          <button
            key={b.id}
            onClick={() => props.onSelect(b.id)}
            title={b.name}
            style={{
              padding: 4,
              background: 'var(--mz-paper)',
              border: `1px solid ${active ? 'var(--mz-accent)' : 'var(--mz-line)'}`,
              boxShadow: active ? '0 0 0 1px var(--mz-accent) inset' : 'none',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <div style={{ width: w, height: h }}>
              <BubbleSvg bubble={b} style={props.style} />
            </div>
            <div
              style={{
                fontSize: 9,
                color: 'var(--mz-text-faint)',
                fontFamily: 'monospace',
              }}
            >
              {b.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Bubble thumbnail renderer --------------------------------------

/** Compute a layer's transform onto the bubble box. */
function layerTransform(b: Bubble, l: BubbleLayer): { tx: number; ty: number; s: number } {
  const ax = b.box.w * l.anchorX;
  const ay = b.box.h * l.anchorY;
  const tx = ax + l.offsetX - (l.glyph.box.w * l.scale) / 2;
  const ty = ay + l.offsetY - (l.glyph.box.h * l.scale) / 2;
  return { tx, ty, s: l.scale };
}

function polygonToPath(poly: readonly Vec2[]): string {
  if (poly.length === 0) return '';
  const parts: string[] = [`M ${poly[0]!.x.toFixed(2)} ${poly[0]!.y.toFixed(2)}`];
  for (let i = 1; i < poly.length; i++) {
    parts.push(`L ${poly[i]!.x.toFixed(2)} ${poly[i]!.y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Resolve a layer's fill colour, or `null` when it should not be filled.
 * Default — when `fill` is omitted entirely — is unfilled (matches the
 * `'none'` semantics of the type), so a fresh layer is just ink strokes.
 */
function fillColorForLayer(l: BubbleLayer): string | null {
  const f = l.fill;
  if (!f || f.mode === 'none') return null;
  if (f.mode === 'paper') return '#ffffff';
  if (f.mode === 'ink') return '#000000';
  return f.color ?? '#ffffff';
}

function LayerPolygons(props: {
  layer: BubbleLayer;
  style: StyleSettings;
  bubble: Bubble;
}): JSX.Element {
  const { layer, style, bubble } = props;
  const { tx, ty, s } = layerTransform(bubble, layer);
  const gStyle = useMemo(
    () => effectiveStyleForGlyph(style, layer.glyph),
    [style, layer.glyph],
  );
  const polys = useMemo(
    () => layer.glyph.strokes.map((stk) => outlineStroke(stk, gStyle)),
    [layer.glyph, gStyle],
  );
  const fillPath = useMemo(() => {
    // Bubble fill follows only the *first* stroke's centerline
    // ("spline0"): that is the bubble outline. Decorative inner
    // strokes (tail accents, sparkles, lettering hints) must not
    // contribute to the filled interior.
    const first = layer.glyph.strokes[0];
    const loops = first ? fillLoopsForStrokes([first]) : [];
    return loopsToPath(loops);
  }, [layer.glyph.strokes]);

  const visible = layer.visible !== false;
  const opacity = visible ? (layer.fill?.opacity ?? 1) : 0;
  const fillColor = fillColorForLayer(layer);

  return (
    <g transform={`translate(${tx} ${ty}) scale(${s})`} opacity={opacity}>
      {fillColor && fillPath && (
        <path d={fillPath} fill={fillColor} fillRule="evenodd" stroke="none" />
      )}
      {polys.map((p, i) => (
        <path key={i} d={polygonToPath(p)} fill="var(--mz-ink)" stroke="none" />
      ))}
    </g>
  );
}

function BubbleSvg(props: { bubble: Bubble; style: StyleSettings }): JSX.Element {
  const { bubble, style } = props;
  return (
    <svg
      viewBox={`0 0 ${bubble.box.w} ${bubble.box.h}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {bubble.layers.map((l) => (
        <LayerPolygons key={l.id} layer={l} style={style} bubble={bubble} />
      ))}
    </svg>
  );
}

// ---------- Layer list (left drawer) ---------------------------------------

function LayerList(props: { bubble: Bubble }): JSX.Element {
  const editing = useBubbleEditing();
  const selectedLayer = editing.selectedLayerId;
  const selectLayer = editing.selectLayer;
  const updateLayer = editing.updateLayer;
  const removeLayer = editing.removeLayer;
  const { bubble } = props;
  return (
    <div className="mz-section">
      <div className="mz-section__title">Layers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {bubble.layers.map((l) => {
          const active = l.id === selectedLayer;
          return (
            <div
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 4px',
                background: active ? 'var(--mz-accent)' : 'transparent',
                color: active ? 'var(--mz-paper)' : 'var(--mz-text)',
                borderRadius: 3,
                cursor: 'pointer',
              }}
              onClick={() => selectLayer(l.id)}
            >
              <input
                type="checkbox"
                checked={l.visible !== false}
                onChange={(e) =>
                  updateLayer(l.id, (lr) => ({
                    ...lr,
                    visible: e.target.checked,
                  }))
                }
                onClick={(e) => e.stopPropagation()}
                title="Visible"
              />
              <span style={{ flex: 1, fontSize: 12 }}>{l.name}</span>
              {l.role && (
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'monospace',
                    opacity: 0.7,
                  }}
                >
                  {l.role}
                </span>
              )}
              <button
                title="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLayer(l.id);
                }}
                className="mz-btn--warn"
                style={{ padding: '0 4px', fontSize: 10 }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// __APPEND_MARKER__

// ---------- Underlay helpers (rendered inside the GlyphEditor) -------------

/**
 * Renders one *other* bubble layer in **bubble (world) coords**. Used
 * by the editor underlay so siblings appear in their actual position
 * inside the bubble, regardless of which layer is currently being
 * edited. When `onSelect` is provided, clicking the layer's artwork
 * makes it the active layer (so the artist can switch layers without
 * leaving the canvas).
 */
function UnderlayLayer(props: {
  layer: BubbleLayer;
  style: StyleSettings;
  bubble: Bubble;
  onSelect?: () => void;
  /** Multiplier on the layer's centerline fill opacity (0-1). */
  fillOpacity?: number;
  /** Multiplier on the layer's stroke opacity (0-1). */
  strokeOpacity?: number;
  /** When true, draw only the fill, not the variable-width stroke
   *  outlines. Used for the active layer so GlyphEditor can render
   *  the strokes on top without double-stacking. */
  hideStrokes?: boolean;
}): JSX.Element {
  const { layer, style, onSelect, fillOpacity = 1, strokeOpacity = 1, hideStrokes = false } = props;
  const { tx, ty, s } = layerTransform(props.bubble, layer);
  const gStyle = useMemo(
    () => effectiveStyleForGlyph(style, layer.glyph),
    [style, layer.glyph],
  );
  const polys = useMemo(
    () => layer.glyph.strokes.map((stk) => outlineStroke(stk, gStyle)),
    [layer.glyph, gStyle],
  );
  const fillPath = useMemo(() => {
    // Spline0 only — see LayerPolygons for rationale.
    const first = layer.glyph.strokes[0];
    const loops = first ? fillLoopsForStrokes([first]) : [];
    return loopsToPath(loops);
  }, [layer.glyph.strokes]);
  const fillColor = fillColorForLayer(layer);
  // Pointer events default to "none" (inherited from the underlay
  // wrapper in GlyphEditor); we re-enable them on the artwork so
  // clicks on the visible polygons select this layer. Empty space
  // inside the layer's transform still passes through to the editor.
  const handlePointerDown: React.PointerEventHandler<SVGElement> = onSelect
    ? (e) => {
        // Only react to primary mouse button; let middle/right pass
        // through so pan/context-menu still work.
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect();
      }
    : () => {};
  const interactive = onSelect
    ? { style: { pointerEvents: 'visiblePainted' as const, cursor: 'pointer' } }
    : {};
  return (
    <g transform={`translate(${tx} ${ty}) scale(${s})`}>
      {fillColor && fillPath && (
        <path
          d={fillPath}
          fill={fillColor}
          fillRule="evenodd"
          stroke="none"
          opacity={(layer.fill?.opacity ?? 1) * fillOpacity}
          onPointerDown={handlePointerDown}
          {...interactive}
        />
      )}
      {polys.map((p, i) => (
        <path
          key={i}
          d={polygonToPath(p)}
          fill="var(--mz-ink)"
          stroke="none"
          opacity={hideStrokes ? 0 : strokeOpacity}
          pointerEvents={hideStrokes ? 'none' : undefined}
          onPointerDown={handlePointerDown}
          {...interactive}
        />
      ))}
    </g>
  );
}

// ---------- Preview text panel --------------------------------------------

/**
 * Editor for the selected bubble's `dummyText` (the placeholder lettering
 * that floats inside the bubble while the artist is shaping it). Includes
 * a dropdown to pull in a snippet from the global TextPresets library —
 * same source the StyleSetter uses — so a 1-click switch between "Just
 * Kidding", "Noir", etc. is possible without retyping.
 */
function PreviewTextPanel(): JSX.Element | null {
  const editing = useBubbleEditing();
  const bubble = editing.bubble;
  const updateBubble = editing.updateBubble;
  const overrides = useTextPresetsStore((s) => s.overrides);
  const activeKey = useTextPresetsStore(
    (s) => s.activeBy.bubblesetter ?? null,
  );
  const setActive = useTextPresetsStore((s) => s.setActive);
  const setOverride = useTextPresetsStore((s) => s.setOverride);
  if (!bubble) return null;
  const text = bubble.dummyText ?? '';
  return (
    <Section title="Preview text">
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12 }}>Load snippet</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={activeKey ?? ''}
            onChange={(e) => {
              const enc = e.target.value;
              if (!enc) {
                setActive('bubblesetter', null);
                return;
              }
              const [setId, idxStr] = enc.split('::');
              const set = textPresetSets.find((s) => s.id === setId);
              const idx = Number(idxStr);
              const orig = set?.bubbles[idx]?.text;
              if (orig === undefined) return;
              setActive('bubblesetter', enc);
              const next = overrides[enc] ?? orig;
              updateBubble((b) => ({ ...b, dummyText: next }));
            }}
            style={{ padding: 4, flex: 1 }}
          >
            <option value="">— load snippet —</option>
            {textPresetSets.map((set) => (
              <optgroup key={set.id} label={set.name}>
                {set.bubbles.map((b, i) => {
                  const k = presetKey(set.id, i);
                  const modified = overrides[k] !== undefined;
                  return (
                    <option key={k} value={k}>
                      {b.label}
                      {modified ? ' •' : ''}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          <button
            className="mz-btn--warn"
            onClick={() => {
              if (activeKey) setOverride(activeKey, text);
            }}
            disabled={!activeKey}
            title={
              activeKey
                ? 'Overwrite this preset with the current preview text'
                : 'Load a snippet first to overwrite it'
            }
            style={{ padding: '2px 8px' }}
          >
            Save
          </button>
        </div>
      </label>
      <textarea
        value={text}
        onChange={(e) =>
          updateBubble((b) => ({ ...b, dummyText: e.target.value }))
        }
        rows={3}
        placeholder="HELLO\nWORLD"
        style={{
          width: '100%',
          fontSize: 12,
          padding: 6,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          boxSizing: 'border-box',
          resize: 'vertical',
        }}
      />
    </Section>
  );
}

/**
 * Placeholder text shown inside the bubble while editing, in **bubble
 * (world) coords**. SVG <text> with a system font — it's a sketch,
 * not the final lettering. Wrapping is by literal newlines.
 */
function DummyTextOverlay(props: {
  text: string;
  boxW: number;
  boxH: number;
}): JSX.Element {
  const { text, boxW, boxH } = props;
  const lines = text.split('\n');
  // Font size in bubble units. Tuned so default presets read clearly.
  const fontPx = 18;
  const lineH = fontPx * 1.15;
  const cx = boxW / 2;
  const cy = boxH / 2 - ((lines.length - 1) * lineH) / 2;
  return (
    <g
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fontWeight={600}
      fill="var(--mz-text-mute)"
      opacity={0.55}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {lines.map((ln, i) => (
        <text key={i} x={cx} y={cy + i * lineH} fontSize={fontPx}>
          {ln}
        </text>
      ))}
    </g>
  );
}
