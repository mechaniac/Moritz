/**
 * Register cObject kind schemas for Moritz so the floating attributes
 * inspector shows meaningful controls for selected glyphs/strokes/anchors.
 *
 * This is a side-effect module — import it once at app boot. Fields use
 * `read`/`write` lenses that reach into Zustand stores because the cObject
 * tree is derived (not authoritative) in the current architecture.
 */

import { registerCKindSchema } from '@christof/sigrid/core';
import { useAppStore } from '../../state/store.js';
import { useBubbleStore } from '../../state/bubbleStore.js';
import {
  getGlyphSetterSelection,
} from '../../modules/glyphsetter/GlyphSetter.js';

// ---------------------------------------------------------------------------
// Helpers to extract indices from the selected node's context
// ---------------------------------------------------------------------------

function currentGlyph() {
  const { font, selectedGlyph } = useAppStore.getState();
  return font.glyphs[selectedGlyph];
}

function currentStrokeIdx(): number | undefined {
  const sel = getGlyphSetterSelection();
  if (sel.kind === 'stroke' || sel.kind === 'anchor') return sel.strokeIdx;
  return undefined;
}

function currentAnchorIdx(): { strokeIdx: number; vIdx: number } | undefined {
  const sel = getGlyphSetterSelection();
  if (sel.kind === 'anchor') return { strokeIdx: sel.strokeIdx, vIdx: sel.vIdx };
  return undefined;
}

// ---------------------------------------------------------------------------
// Glyph kind — shows glyph character and box dimensions
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.glyph',
  moduleId: 'moritz',
  fields: [
    {
      name: 'char',
      kind: 'string',
      label: 'Character',
      read: () => {
        return useAppStore.getState().selectedGlyph;
      },
    },
    {
      name: 'boxW',
      kind: 'number',
      label: 'Box width',
      min: 10,
      max: 500,
      step: 1,
      read: () => currentGlyph()?.box.w ?? 0,
      write: ({ value, node }) => {
        const v = Number(value);
        useAppStore.getState().updateSelectedGlyph((g) => ({
          ...g,
          box: { ...g.box, w: v },
        }));
        return node;
      },
    },
    {
      name: 'boxH',
      kind: 'number',
      label: 'Box height',
      min: 10,
      max: 500,
      step: 1,
      read: () => currentGlyph()?.box.h ?? 0,
      write: ({ value, node }) => {
        const v = Number(value);
        useAppStore.getState().updateSelectedGlyph((g) => ({
          ...g,
          box: { ...g.box, h: v },
        }));
        return node;
      },
    },
    {
      name: 'strokes',
      kind: 'integer',
      label: 'Stroke count',
      read: () => currentGlyph()?.strokes.length ?? 0,
    },
  ],
});

// ---------------------------------------------------------------------------
// Stroke kind — shows stroke vertex count and width
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.stroke',
  moduleId: 'moritz',
  fields: [
    {
      name: 'vertices',
      kind: 'integer',
      label: 'Vertices',
      read: () => {
        const glyph = currentGlyph();
        const idx = currentStrokeIdx();
        if (!glyph || idx === undefined) return 0;
        return glyph.strokes[idx]?.vertices.length ?? 0;
      },
    },
    {
      name: 'width',
      kind: 'number',
      label: 'Width override',
      min: 0,
      max: 40,
      step: 0.5,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentStrokeIdx();
        if (!glyph || idx === undefined) return 0;
        const stroke = glyph.strokes[idx];
        return stroke?.width?.samples[0]?.width ?? 0;
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Anchor kind — shows anchor position and handles
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.anchor',
  moduleId: 'moritz',
  fields: [
    {
      name: 'px',
      kind: 'number',
      label: 'X',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.p.x ?? 0;
      },
    },
    {
      name: 'py',
      kind: 'number',
      label: 'Y',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.p.y ?? 0;
      },
    },
    {
      name: 'inX',
      kind: 'number',
      label: 'In handle X',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.inHandle.x ?? 0;
      },
    },
    {
      name: 'inY',
      kind: 'number',
      label: 'In handle Y',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.inHandle.y ?? 0;
      },
    },
    {
      name: 'outX',
      kind: 'number',
      label: 'Out handle X',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.outHandle.x ?? 0;
      },
    },
    {
      name: 'outY',
      kind: 'number',
      label: 'Out handle Y',
      step: 0.1,
      read: () => {
        const glyph = currentGlyph();
        const idx = currentAnchorIdx();
        if (!glyph || !idx) return 0;
        return glyph.strokes[idx.strokeIdx]?.vertices[idx.vIdx]?.outHandle.y ?? 0;
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Font kind — shows font-level info
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.font',
  moduleId: 'moritz',
  fields: [
    {
      name: 'name',
      kind: 'string',
      label: 'Font name',
      read: () => useAppStore.getState().font.name,
    },
    {
      name: 'glyphCount',
      kind: 'integer',
      label: 'Glyphs',
      read: () => Object.keys(useAppStore.getState().font.glyphs).length,
    },
  ],
});

// ---------------------------------------------------------------------------
// Bubble font kind
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.bubbleFont',
  moduleId: 'moritz',
  fields: [
    {
      name: 'name',
      kind: 'string',
      label: 'Bubble font name',
      read: () => useBubbleStore.getState().font.name,
    },
    {
      name: 'bubbleCount',
      kind: 'integer',
      label: 'Bubbles',
      read: () => Object.keys(useBubbleStore.getState().font.bubbles).length,
    },
  ],
});

// ---------------------------------------------------------------------------
// Bubble kind
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.bubble',
  moduleId: 'moritz',
  fields: [
    {
      name: 'layers',
      kind: 'integer',
      label: 'Layers',
      read: ({ node }) => node.children.length,
    },
  ],
});

// ---------------------------------------------------------------------------
// Bubble layer kind
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.bubbleLayer',
  moduleId: 'moritz',
  fields: [
    {
      name: 'name',
      kind: 'string',
      label: 'Layer',
      read: ({ node }) => node.extras?.['displayName'] ?? '',
    },
  ],
});

// ---------------------------------------------------------------------------
// Page kind
// ---------------------------------------------------------------------------

registerCKindSchema({
  kind: 'cnode.moritz.page',
  moduleId: 'moritz',
  fields: [
    {
      name: 'name',
      kind: 'string',
      label: 'Page',
      read: ({ node }) => node.extras?.['displayName'] ?? '',
    },
    {
      name: 'blocks',
      kind: 'integer',
      label: 'Blocks',
      read: ({ node }) => node.children.length,
    },
  ],
});
