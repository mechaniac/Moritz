import type { MFunctionCallHandler } from '@christof/magdalena/panels';
import type { MWorkbenchProps } from '@christof/magdalena';
import { mBuildWordWeightsForScope } from '@christof/magdalena/word-weight';
import type { MWorkspaceRuntimeSnapshot } from '@christof/magdalena/workspace';
import { cDocumentById, cToggleCollapse, type cObject, type Vec3 } from '@christof/sigrid/core';
import { readWorkbenchView } from '@christof/sigrid/modules';
import { MORITZ_MODULE_ID } from './moduleSkins.js';
import {
  applyMoritzSelection,
  moritzSelectedIdForView,
  moritzTreeForView,
  moritzViewForDocumentId,
  moritzViewIds,
} from './workspaceTrees.js';

type MoritzWorkspaceSnapshot = MWorkspaceRuntimeSnapshot<HTMLElement | null>;

export interface MoritzWorkbenchHandlers {
  readonly onTreeChange: (next: cObject) => void;
  readonly onFunctionCall: MFunctionCallHandler;
  readonly onSetActiveModule: (id: string) => void;
  readonly onSelect: (id: string | undefined) => void;
  readonly onMoveSelection: (id: string, position: Vec3) => void;
  readonly onChromeChange: (next: cObject) => void;
  readonly onInterfaceTreeChange: (next: cObject) => void;
}

export interface BuildMoritzWorkbenchPropsInput {
  readonly snapshot: MoritzWorkspaceSnapshot;
  readonly interfaceTree: cObject | undefined;
  readonly handlers: MoritzWorkbenchHandlers;
}

export function buildMoritzWorkbenchProps(
  input: BuildMoritzWorkbenchPropsInput,
): MWorkbenchProps {
  const { snapshot: ws, handlers, interfaceTree } = input;
  const activeModuleId = ws.state.activeModuleId || MORITZ_MODULE_ID;
  const isMoritzActive = activeModuleId === MORITZ_MODULE_ID;
  const viewId = moritzViewForDocumentId(
    ws.state.activeDocumentByModule[MORITZ_MODULE_ID],
  );
  const displayed = ws.displayedDocument;
  const tree = isMoritzActive
    ? moritzTreeForView(viewId)
    : displayed?.tree ?? ws.documents[0]?.tree ?? moritzTreeForView(viewId);
  const chromeTree = cDocumentById(ws.state, 'workbench')?.tree;
  const skinsTree = cDocumentById(ws.state, 'skins')?.tree;
  const viewportBinding = ws.resolvedBindings.get('viewport');
  const leftbarBinding = ws.resolvedBindings.get('leftbar');
  const floatingBinding = ws.resolvedBindings.get('floating');

  return {
    tree,
    onTreeChange: handlers.onTreeChange,
    onFunctionCall: handlers.onFunctionCall,
    modules: ws.config.modules,
    activeModuleId,
    onSetActiveModule: handlers.onSetActiveModule,
    selectedId: isMoritzActive
      ? moritzSelectedIdForView(viewId) ?? ws.state.selectionId
      : ws.state.selectionId,
    wordWeights: mBuildWordWeightsForScope(
      [tree, ...(chromeTree ? [chromeTree] : []), ...(interfaceTree ? [interfaceTree] : [])],
      [
        ...ws.config.modules.map((mod) => mod.id),
        ...moritzViewIds,
        'glyphs', 'bubbles', 'styles', 'pages',
        // Gateway function names and UI labels for word-weighting
        'font', 'save', 'load', 'delete', 'export', 'import',
        'stroke', 'anchor', 'flip', 'horizontal', 'vertical',
        'style', 'slant', 'scale', 'width', 'world', 'blend',
        'contract', 'angle', 'cap', 'start', 'end', 'bulge',
        'tracking', 'space', 'line', 'height',
        'relax', 'curves', 'tangents', 'vertex', 'evenness',
        'geometry', 'triangulation', 'spacing', 'smoothing',
        'ribbon', 'spine', 'shape', 'subdivisions', 'density',
        'jitter', 'amount', 'scope', 'instance', 'glyph', 'text',
        'bubble', 'layer', 'page', 'block',
        'kerning', 'pair', 'guides', 'debug', 'borders', 'triangles',
        'spline', 'normals', 'fill', 'opacity', 'preview',
        'moritz', 'round', 'flat', 'tapered',
      ],
    ),
    mode: readWorkbenchView(tree),
    onSelect: (id) => {
      if (isMoritzActive) applyMoritzSelection(viewId, id);
      handlers.onSelect(id);
    },
    onMoveSelection: handlers.onMoveSelection,
    viewport: viewportBinding?.render(ws.bindingContext),
    leftbar: leftbarBinding?.render(ws.bindingContext),
    floating: floatingBinding?.render(ws.bindingContext),
    skins: skinsTree,
    chrome: chromeTree,
    onChromeChange: handlers.onChromeChange,
    onInterfaceTreeChange: handlers.onInterfaceTreeChange,
  };
}

export { moritzFunctionCallHandler } from './core/gateway/moritzFunctionCallHandler.js';

export function toggleMoritzChromeBar(chrome: cObject, id: string): cObject {
  return cToggleCollapse(chrome, id);
}
