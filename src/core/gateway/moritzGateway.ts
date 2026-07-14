/**
 * Gateway function declarations for the Moritz module.
 *
 * These are UI declarations only — actual execution is intercepted by the
 * function call handler in workbench-props.ts. The `call` body is a no-op
 * identity (returns tree unchanged) because every call is intercepted before
 * magdalena's default execution path runs.
 */

import type { PublicFn } from '@christof/sigrid/core';
import type { cObject } from '@christof/sigrid/core';
import type { ModuleId } from '../../state/store.js';
import { useAppStore } from '../../state/store.js';
import { useBubbleStore } from '../../state/bubbleStore.js';
import { listFontIds } from '../../state/persistence.js';
import { listBubbleFontIds } from '../../state/bubblePersistence.js';
import { listStyleIds } from '../../state/stylePersistence.js';
import { listPageIds } from '../../state/pagePersistence.js';
import { builtInFonts } from '../../data/builtInFonts.js';
import { builtInBubbleFonts } from '../../data/builtInBubbleFonts.js';
import { builtInStyles } from '../../data/builtInStyles.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const identity = (tree: cObject) => tree;

function manualAction(summary: string): PublicFn {
  return { callMode: 'manual', summary, params: [], call: identity };
}

function enumLoader(
  summary: string,
  computeOptions: () => readonly string[],
): PublicFn {
  return {
    callMode: 'manual',
    summary,
    params: [{
      name: 'id',
      kind: 'enum',
      label: 'Name',
      computeOptions: () => computeOptions(),
    }],
    call: identity,
  };
}

function liveSlider(
  summary: string,
  min: number,
  max: number,
  step: number,
  computeDefault?: () => unknown,
): PublicFn {
  return {
    callMode: 'live',
    summary,
    params: [{
      name: 'value',
      kind: 'number',
      min,
      max,
      step,
      computeDefault: computeDefault ? () => computeDefault() : undefined,
    }],
    call: identity,
  };
}

function liveEnum(
  summary: string,
  options: readonly string[],
  computeDefault?: () => unknown,
): PublicFn {
  return {
    callMode: 'live',
    summary,
    params: [{
      name: 'value',
      kind: 'enum',
      options,
      computeDefault: computeDefault ? () => computeDefault() : undefined,
    }],
    call: identity,
  };
}

// ---------------------------------------------------------------------------
// Per-view gateway builders
// ---------------------------------------------------------------------------

function fontOptions(): readonly string[] {
  const saved = new Set(listFontIds());
  const builtIn = builtInFonts.map((f) => f.id);
  const user = [...saved].filter((id) => !builtIn.includes(id));
  return [...builtIn, ...user];
}

function bubbleFontOptions(): readonly string[] {
  const saved = new Set(listBubbleFontIds());
  const builtIn = builtInBubbleFonts.map((f) => f.id);
  const user = [...saved].filter((id) => !builtIn.includes(id));
  return [...builtIn, ...user];
}

function styleOptions(): readonly string[] {
  const saved = new Set(listStyleIds());
  const builtIn = builtInStyles.map((s) => s.id);
  const user = [...saved].filter((id) => !builtIn.includes(id));
  return [...builtIn, ...user];
}

function pageOptions(): readonly string[] {
  return listPageIds();
}

// ---------------------------------------------------------------------------
// GlyphSetter gateway
// ---------------------------------------------------------------------------

function glyphSetterGateway(): Record<string, PublicFn> {
  return {
    saveFont: {
      callMode: 'manual',
      summary: 'Save the active font to browser storage',
      params: [{
        name: 'name',
        kind: 'string',
        label: 'Name',
        computeDefault: () => useAppStore.getState().font.name,
      }],
      call: identity,
    },
    loadFont: enumLoader('Load a font', fontOptions),
    deleteFont: enumLoader('Delete a saved font', fontOptions),
    exportFont: manualAction('Export the active font as JSON'),
    addStroke: manualAction('Add a new stroke to the selected glyph'),
    addAnchor: manualAction('Insert an anchor at the midpoint of the selected segment'),
    deleteSelected: manualAction('Delete the selected anchor or stroke(s)'),
    flipH: manualAction('Flip selected stroke(s) horizontally'),
    flipV: manualAction('Flip selected stroke(s) vertically'),
  };
}

// ---------------------------------------------------------------------------
// BubbleSetter gateway
// ---------------------------------------------------------------------------

function bubbleSetterGateway(): Record<string, PublicFn> {
  return {
    saveBubbleFont: {
      callMode: 'manual',
      summary: 'Save the active bubble font',
      params: [{
        name: 'name',
        kind: 'string',
        label: 'Name',
        computeDefault: () => useBubbleStore.getState().font.name,
      }],
      call: identity,
    },
    loadBubbleFont: enumLoader('Load a bubble font', bubbleFontOptions),
    deleteBubbleFont: enumLoader('Delete a saved bubble font', bubbleFontOptions),
    exportBubbleFont: manualAction('Export the active bubble font as JSON'),
  };
}

// ---------------------------------------------------------------------------
// StyleSetter gateway
// ---------------------------------------------------------------------------

function styleSetterGateway(): Record<string, PublicFn> {
  const s = () => useAppStore.getState().style;
  const cap = (c: unknown) => (c === 'round' || c === 'flat' || c === 'tapered' ? c : 'round');
  return {
    saveStyle: {
      callMode: 'manual',
      summary: 'Save the active style',
      params: [{
        name: 'name',
        kind: 'string',
        label: 'Name',
        computeDefault: () => 'Default',
      }],
      call: identity,
    },
    loadStyle: enumLoader('Load a style', styleOptions),
    deleteStyle: enumLoader('Delete a saved style', styleOptions),
    exportStyle: manualAction('Export the active style as JSON'),
    // Geometry
    setSlant: liveSlider('Italic shear (radians)', -0.5, 0.5, 0.01, () => s().slant),
    setScaleX: liveSlider('Horizontal stretch', 0.4, 2, 0.01, () => s().scaleX),
    setScaleY: liveSlider('Vertical stretch', 0.4, 2, 0.01, () => s().scaleY),
    // Stroke
    setStrokeWidth: liveSlider('Default stroke width', 1, 28, 0.5, () => s().defaultWidth.samples[0]?.width ?? 8),
    setWorldBlend: liveSlider('World blend (tangent→world nib)', 0, 1, 0.01, () => s().worldBlend ?? (s().widthOrientation === 'world' ? 1 : 0)),
    setWorldContract: liveSlider('World contract', 0, 1, 0.01, () => s().worldContract ?? 0),
    setWorldAngle: liveSlider('World blend angle (rad)', -1.57, 1.57, 0.01, () => s().worldAngle),
    setWorldContractAngle: liveSlider('World contract angle (rad)', -1.57, 1.57, 0.01, () => s().worldContractAngle ?? s().worldAngle),
    setCapStart: liveEnum('Start cap shape', ['round', 'flat', 'tapered'], () => cap(s().capStart)),
    setCapEnd: liveEnum('End cap shape', ['round', 'flat', 'tapered'], () => cap(s().capEnd)),
    setCapBulge: liveSlider('Cap roundness', 0, 2, 0.05, () => s().capRoundBulge ?? 1),
    // Spacing
    setTracking: liveSlider('Extra space between glyphs', -30, 60, 1, () => s().tracking ?? 0),
    setSpaceWidth: liveSlider('Space character width', 0, 200, 1, () => s().spaceWidth ?? 56),
    setLineHeight: liveSlider('Line height multiplier', 0.8, 2.5, 0.05, () => s().lineHeight ?? 1.2),
    // Smoothing
    setRelaxCurves: liveSlider('Relax curves (Laplacian smoothing)', 0, 1, 0.01, () => s().relaxCurves ?? 0),
    setRelaxTangents: liveSlider('Relax tangents (edge equalize)', 0, 1, 0.01, () => s().relaxTangents ?? 0),
    setVertexEvenness: liveSlider('Vertex evenness', 0, 1, 0.01, () => s().vertexEvenness ?? 0),
  };
}

// ---------------------------------------------------------------------------
// TypeSetter gateway
// ---------------------------------------------------------------------------

function typeSetterGateway(): Record<string, PublicFn> {
  return {
    savePage: {
      callMode: 'manual',
      summary: 'Save the active page',
      params: [{
        name: 'name',
        kind: 'string',
        label: 'Name',
        computeDefault: () => 'Untitled',
      }],
      call: identity,
    },
    loadPage: enumLoader('Load a page', pageOptions),
    deletePage: enumLoader('Delete a saved page', pageOptions),
    exportPage: manualAction('Export the active page as JSON'),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the gateway record for the given active Moritz view. Called on view
 * switch; the result replaces `moritzModule.gateway`.
 */
export function buildMoritzGateway(viewId: ModuleId): Record<string, PublicFn> {
  switch (viewId) {
    case 'glyphsetter': return glyphSetterGateway();
    case 'bubblesetter': return bubbleSetterGateway();
    case 'stylesetter': return styleSetterGateway();
    case 'typesetter': return typeSetterGateway();
  }
}
