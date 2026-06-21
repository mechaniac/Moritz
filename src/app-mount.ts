import {
  createMWorkspaceRuntime,
  type MWorkspaceRuntimeManifest,
} from '@christof/magdalena/workspace';
import { mountWorkbench, type MountedWorkbench } from '@christof/magdalena/mounts';
import type { ReactElement } from 'react';
import type { cObject, Vec3 } from '@christof/sigrid/core';
import { MORITZ_MODULE_ID } from './moduleSkins.js';
import { subscribeGlyphSetterSelection } from './modules/glyphsetter/GlyphSetter.js';
import { useBubbleStore } from './state/bubbleStore.js';
import { useAppStore } from './state/store.js';
import { useTypesetterStore } from './state/typesetterStore.js';
import {
  buildMoritzWorkbenchProps,
  moritzFunctionCallHandler,
} from './workbench-props.js';
import {
  applyMoritzSelection,
  moritzSelectedIdForView,
  moritzViewForDocumentId,
} from './workspaceTrees.js';
import { moritzWorkspace } from './workspace.js';

export interface MountedMoritzApp {
  unmount(): void;
}

export function mountMoritzApp(host: HTMLElement): MountedMoritzApp {
  host.textContent = '';
  const workbenchHost = document.createElement('div');
  workbenchHost.className = 'mz-host';
  host.appendChild(workbenchHost);

  let workbench: MountedWorkbench | undefined;
  let interfaceTree: cObject | undefined;
  const runtime = createMWorkspaceRuntime<ReactElement>(
    moritzWorkspace as unknown as MWorkspaceRuntimeManifest<ReactElement>,
  );

  const unsubscribeRuntime = runtime.subscribe(render);
  const unsubscribeApp = useAppStore.subscribe(render);
  const unsubscribeBubble = useBubbleStore.subscribe(render);
  const unsubscribeTypesetter = useTypesetterStore.subscribe(render);
  const unsubscribeGlyphSelection = subscribeGlyphSetterSelection(render);

  runtime.attach();
  render();

  return {
    unmount() {
      unsubscribeGlyphSelection();
      unsubscribeTypesetter();
      unsubscribeBubble();
      unsubscribeApp();
      unsubscribeRuntime();
      workbench?.unmount();
      runtime.destroy();
      host.textContent = '';
    },
  };

  function render(): void {
    const ws = runtime.getSnapshot();
    const viewId = moritzViewForDocumentId(
      ws.state.activeDocumentByModule[MORITZ_MODULE_ID],
    );
    if (useAppStore.getState().module !== viewId) {
      useAppStore.getState().setModule(viewId);
    }
    const props = buildMoritzWorkbenchProps({
      snapshot: ws,
      interfaceTree,
      handlers: {
        onTreeChange: (next) =>
          ws.dispatch({ type: 'updateActiveTree', tree: next }),
        onFunctionCall: moritzFunctionCallHandler,
        onSetActiveModule: (id) => {
          ws.dispatch({ type: 'setActiveModule', moduleId: id });
          ws.dispatch({
            type: 'setSelection',
            cObjectId: moritzSelectedIdForView(viewId),
          });
        },
        onSelect: (id) => {
          applyMoritzSelection(viewId, id);
          ws.dispatch({ type: 'setSelection', cObjectId: id });
        },
        onMoveSelection: (_id: string, _position: Vec3) => {},
        onChromeChange: (next) =>
          ws.dispatch({
            type: 'replaceDocument',
            documentId: 'workbench',
            tree: next,
          }),
        onInterfaceTreeChange: (next) => {
          interfaceTree = next;
        },
      },
    });

    if (workbench === undefined) {
      workbench = mountWorkbench(workbenchHost, props);
    } else {
      workbench.update(props);
    }
  }
}
