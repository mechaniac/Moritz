import type { ReactElement } from 'react';
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

type MoritzWorkspaceSnapshot = MWorkspaceRuntimeSnapshot<ReactElement>;

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
  const viewId = moritzViewForDocumentId(
    ws.state.activeDocumentByModule[MORITZ_MODULE_ID],
  );
  const tree = moritzTreeForView(viewId);
  const chromeTree = cDocumentById(ws.state, 'workbench')?.tree;
  const skinsTree = cDocumentById(ws.state, 'skins')?.tree;
  const viewportBinding = ws.resolvedBindings.get('viewport');
  const leftbarBinding = ws.resolvedBindings.get('leftbar');
  const floatingBinding = ws.resolvedBindings.get('floating');
  const settingsBinding = ws.resolvedBindings.get('workbenchSettings');

  return {
    tree,
    onTreeChange: handlers.onTreeChange,
    onFunctionCall: handlers.onFunctionCall,
    modules: ws.config.modules,
    activeModuleId,
    onSetActiveModule: handlers.onSetActiveModule,
    selectedId: moritzSelectedIdForView(viewId) ?? ws.state.selectionId,
    wordWeights: mBuildWordWeightsForScope(
      [tree, ...(chromeTree ? [chromeTree] : []), ...(interfaceTree ? [interfaceTree] : [])],
      [
        ...ws.config.modules.map((mod) => mod.id),
        ...moritzViewIds,
        'glyphs',
        'bubbles',
        'styles',
        'pages',
      ],
    ),
    mode: readWorkbenchView(tree),
    onSelect: (id) => {
      applyMoritzSelection(viewId, id);
      handlers.onSelect(id);
    },
    onMoveSelection: handlers.onMoveSelection,
    viewport: viewportBinding?.render(ws.bindingContext),
    leftbar: leftbarBinding?.render(ws.bindingContext),
    floating: floatingBinding?.render(ws.bindingContext),
    workbenchSettings: settingsBinding?.render(ws.bindingContext),
    skins: skinsTree,
    chrome: chromeTree,
    onChromeChange: handlers.onChromeChange,
    onInterfaceTreeChange: handlers.onInterfaceTreeChange,
  };
}

export const moritzFunctionCallHandler: MFunctionCallHandler = () => false;

export function toggleMoritzChromeBar(chrome: cObject, id: string): cObject {
  return cToggleCollapse(chrome, id);
}
