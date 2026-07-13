import type { CSSProperties, ReactElement } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MProjectAlert,
  MTreeBrowser,
  MTreeGraph,
  makeMagdalena,
  type MWorkspaceManifest,
} from '@christof/magdalena';
import { createDefaultRegistry } from '@christof/magdalena/registry';
import { createDefaultSkins } from '@christof/magdalena/skins';
import {
  AnitaTreesView,
  anitaDefaultScope,
  extractFunctional,
  extractStructural,
  makeAnita,
} from '@christof/anita';
import {
  cActiveWhenModule,
  cDocumentById,
  cPatchPositionAction,
  cSetImportance,
  cToggleCollapse,
  createCObject,
  createCWorkbench,
  type cBinding,
  type cBindingContext,
  type cBindingSlot,
  type cModule,
  type cObject,
  type cWorkspaceConfig,
} from '@christof/sigrid/core';
import {
  makeSigrid,
  setRadialNodeOffsetOn,
  setRadialNodeRotationOn,
} from '@christof/sigrid/modules';
import {
  MORITZ_MODULE_ID,
  moritzModuleSkin,
  moritzViewSkins,
} from './moduleSkins.js';
import { loadAnitaManifest, readAnitaProjectStatus, type AnitaProjectStatus } from './codebase.js';
import { BubbleSetterAttrs, BubbleSetterOutliner, BubbleSetterStage } from './modules/bubblesetter/BubbleSetter.js';
import { GlyphEditorToolbar, GlyphSetterAttrs, GlyphSetterItemAttrs, GlyphSetterOutliner, GlyphSetterStage } from './modules/glyphsetter/GlyphSetter.js';
import { StyleSetterAttrs, StyleSetterOutliner, StyleSetterStage } from './modules/stylesetter/StyleSetter.js';
import { TypeSetterAttrs, TypeSetterOutliner, TypeSetterStage } from './modules/typesetter/TypeSetter.js';
import {
  moritzDocumentIdForView,
  moritzDocumentIds,
  moritzSelectedIdForView,
  moritzTreeForView,
  moritzViewForDocumentId,
  moritzViewIds,
} from './workspaceTrees.js';
import { useAppStore, type ModuleId } from './state/store.js';
import { FontBar } from './ui/FontBar.js';
import { BubbleBar } from './ui/BubbleBar.js';
import { StyleBar } from './ui/StyleBar.js';
import { PageBar } from './ui/PageBar.js';
import { MoritzLabel } from './ui/MoritzText.js';

const VIEW_LABELS: Readonly<Record<ModuleId, string>> = {
  glyphsetter: 'Glyphs',
  bubblesetter: 'Bubbles',
  stylesetter: 'Styles',
  typesetter: 'Pages',
};

const PRODUCT_REGISTRY_DOCUMENT_ID = 'products';
const APP_DOCUMENT_ID = 'app';
const REGISTRY_DOCUMENT_ID = 'registry';
const ANITA_ALERT_DOCUMENT_ID = 'anitaAlert';
const ANITA_STRUCTURAL_DOCUMENT_ID = 'structuralGraph';
const ANITA_FUNCTIONAL_DOCUMENT_ID = 'functionalGraph';

const anitaProjectStatus = readAnitaProjectStatus();

export const moritzModule: cModule = {
  id: MORITZ_MODULE_ID,
  skin: moritzModuleSkin,
  gateway: {},
  chrome: {
    hud: false,
    floatingAttributes: false,
    workbenchTab: false,
  },
};


const sigridModule = makeSigrid();
const magdalenaModule = makeMagdalena();
const anitaModule = makeAnita(loadAnitaManifest);

export const moritzModules: readonly cModule[] = [
  moritzModule,
  sigridModule,
  magdalenaModule,
  anitaModule,
];

/**
 * Moritz-internal bindings produce React virtual elements. Magdalena's shell
 * expects real HTMLElements. `reactBinding` bridges the two: it creates a
 * persistent container + React root, and on each `render()` call updates
 * the React tree inside it, returning the same container element every time.
 */
type MoritzDomBinding = cBinding<HTMLElement | null>;

function reactBinding(
  id: string,
  slot: cBindingSlot | string,
  activeWhen: ((ctx: cBindingContext) => boolean) | undefined,
  renderFn: (ctx: cBindingContext) => ReactElement,
): MoritzDomBinding {
  let container: HTMLElement | undefined;
  let root: Root | undefined;
  return {
    id,
    slot,
    activeWhen,
    render(ctx) {
      if (!container) {
        container = document.createElement('div');
        container.className = `mz-binding mz-binding--${id.replace(/\./g, '-')}`;
        container.style.display = 'contents';
        root = createRoot(container);
      }
      root!.render(renderFn(ctx));
      return container;
    },
  };
}

/**
 * Wrap a magdalena function (returns HTMLElement) as a MoritzDomBinding.
 */
function domBinding(
  id: string,
  slot: cBindingSlot | string,
  activeWhen: ((ctx: cBindingContext) => boolean) | undefined,
  renderFn: (ctx: cBindingContext) => HTMLElement | null,
): MoritzDomBinding {
  return { id, slot, activeWhen, render: renderFn };
}

const moritzViewportBinding = reactBinding(
  'moritz.viewport',
  'viewport',
  cActiveWhenModule(MORITZ_MODULE_ID),
  (ctx) => createElement(MoritzViewport, { viewId: activeMoritzView(ctx) }),
);

const moritzLeftbarBinding = reactBinding(
  'moritz.leftbar',
  'leftbar',
  cActiveWhenModule(MORITZ_MODULE_ID),
  (ctx) => createElement(MoritzLeftbar, { ctx }),
);

const moritzWorkbenchSettingsBinding = reactBinding(
  'moritz.workbenchSettings',
  'workbenchSettings',
  cActiveWhenModule(MORITZ_MODULE_ID),
  (ctx) => createElement(MoritzWorkbenchSettings, { viewId: activeMoritzView(ctx) }),
);

const anitaViewportBinding = domBinding(
  'anita.viewport',
  'viewport',
  cActiveWhenModule('anita'),
  (ctx) => AnitaViewport({ ctx }),
);

const productGraphViewportBinding = domBinding(
  'christof.productGraph.viewport',
  'viewport',
  (ctx) => productGraphModules.has(ctx.state.activeModuleId),
  (ctx) => ProductGraphViewport({ ctx }),
);

const productTreeBrowserBinding = domBinding(
  'christof.productTreeBrowser.leftbar',
  'leftbar',
  (ctx) => ctx.state.activeModuleId !== MORITZ_MODULE_ID,
  (ctx) => ProductTreeBrowser({ ctx }),
);

const productGraphModules = new Set(['sigrid', 'magdalena']);

const moritzBindings: readonly MoritzDomBinding[] = [
  moritzViewportBinding,
  moritzLeftbarBinding,
  moritzWorkbenchSettingsBinding,
  anitaViewportBinding,
  productGraphViewportBinding,
  productTreeBrowserBinding,
];

const moritzWorkspaceConfig: cWorkspaceConfig = {
  identity: { id: 'moritz', name: 'Moritz' },
  modules: moritzModules,
  documents: [
    {
      id: moritzDocumentIds.glyphsetter,
      name: 'GlyphSetter',
      build: () => moritzTreeForView('glyphsetter'),
    },
    {
      id: moritzDocumentIds.bubblesetter,
      name: 'BubbleSetter',
      build: () => moritzTreeForView('bubblesetter'),
    },
    {
      id: moritzDocumentIds.stylesetter,
      name: 'StyleSetter',
      build: () => moritzTreeForView('stylesetter'),
    },
    {
      id: moritzDocumentIds.typesetter,
      name: 'TypeSetter',
      build: () => moritzTreeForView('typesetter'),
    },
    {
      id: PRODUCT_REGISTRY_DOCUMENT_ID,
      name: 'products',
      build: createProductRegistry,
    },
    {
      id: APP_DOCUMENT_ID,
      name: 'app',
      build: createMoritzAppTree,
    },
    {
      id: 'workbench',
      name: 'workbench',
      build: () => createCWorkbench(),
    },
    {
      id: 'skins',
      name: 'skins',
      build: createMoritzSkins,
    },
    {
      id: REGISTRY_DOCUMENT_ID,
      name: 'registry',
      build: createMoritzRegistry,
    },
    ...(anitaProjectStatus.ok
      ? [
          {
            id: ANITA_STRUCTURAL_DOCUMENT_ID,
            name: 'structuralGraph',
            build: buildStructuralGraphDocument,
          },
          {
            id: ANITA_FUNCTIONAL_DOCUMENT_ID,
            name: 'functionalGraph',
            build: buildFunctionalGraphDocument,
          },
        ]
      : [
          {
            id: ANITA_ALERT_DOCUMENT_ID,
            name: ANITA_ALERT_DOCUMENT_ID,
            build: () => createAnitaAlert(anitaProjectStatus),
          },
        ]),
  ],
  bindings: moritzBindings.map((binding) => ({
    id: binding.id,
    slot: binding.slot,
  })),
  initial: {
    moduleId: MORITZ_MODULE_ID,
    documentByModule: {
      [MORITZ_MODULE_ID]: moritzDocumentIds.glyphsetter,
      sigrid: moritzDocumentIds.glyphsetter,
      magdalena: APP_DOCUMENT_ID,
      anita: anitaProjectStatus.ok
        ? ANITA_FUNCTIONAL_DOCUMENT_ID
        : ANITA_ALERT_DOCUMENT_ID,
    },
    selectionId: moritzSelectedIdForView('glyphsetter'),
  },
};

export const moritzWorkspace: MWorkspaceManifest = {
  config: moritzWorkspaceConfig,
  bindings: moritzBindings,
};

function buildFunctionalGraphDocument(): cObject {
  const manifest = loadAnitaManifest();
  return extractFunctional(manifest, { scope: anitaDefaultScope(manifest) });
}

function buildStructuralGraphDocument(): cObject {
  const manifest = loadAnitaManifest();
  return extractStructural(manifest, { scope: anitaDefaultScope(manifest) });
}

function createAnitaAlert(status: AnitaProjectStatus): cObject {
  return createCObject({
    cId: ANITA_ALERT_DOCUMENT_ID,
    kind: 'cnode.alert',
    description: status.error ?? 'The configured Anita project could not be loaded.',
    tags: ['anita', 'alert'],
    extras: {
      title: 'Anita project unavailable',
      summary: 'Anita could not inspect Moritz, so this alert is shown instead of crashing the workbench.',
      lines: [
        { label: 'project root', text: status.projectRoot },
        { label: 'analysis', text: status.source },
        { label: 'problem', text: status.error ?? 'Unknown project load failure.' },
      ],
    },
  });
}

function createProductRegistry(): cObject {
  return createCObject({
    cId: 'moritz:products',
    kind: 'moritz.products',
    description: 'Product-level cModules registered in the Moritz host workbench.',
    tags: ['moritz', 'christof'],
    children: moritzModules.map((module) =>
      createCObject({
        cId: `product:${module.id}`,
        kind: `${module.id}.module`,
        description:
          module.id === MORITZ_MODULE_ID
            ? 'Moritz is the active child editor suite in this host.'
            : `${module.id} is registered as a sibling Christof product module.`,
        tags: [module.id, 'product'],
        extras: {
          displayName: module.id,
          bg: module.skin.bg,
          fg: module.skin.fg,
        },
      }),
    ),
  });
}

function createMoritzAppTree(): cObject {
  return createCObject({
    cId: 'moritz:app',
    kind: 'magdalena.app',
    description: 'Moritz as mounted into Magdalena workbench surfaces.',
    tags: ['moritz', 'magdalena', 'app'],
    children: [
      createCObject({ cId: 'moritz:topbar', kind: 'magdalena.topbar', tags: ['magdalena'] }),
      createCObject({ cId: 'moritz:leftbar', kind: 'magdalena.leftbar', tags: ['magdalena'] }),
      createCObject({ cId: 'moritz:viewport', kind: 'magdalena.viewport', tags: ['magdalena'] }),
      createCObject({ cId: 'moritz:rightbar', kind: 'magdalena.rightbar', tags: ['magdalena'] }),
      createCObject({ cId: 'moritz:settings', kind: 'magdalena.workbenchSettings', tags: ['magdalena'] }),
    ],
  });
}

function createMoritzSkins(): cObject {
  return createDefaultSkins([moritzModule, 'sigrid', 'magdalena', 'anita']);
}

function createMoritzRegistry(): cObject {
  return createDefaultRegistry([
    { kind: '*', surface: 'outliner', component: 'MOutlinerRow' },
  ]);
}

function activeMoritzView(ctx: cBindingContext): ModuleId {
  return moritzViewForDocumentId(ctx.state.activeDocumentByModule[MORITZ_MODULE_ID]);
}

function setActiveMoritzView(ctx: cBindingContext, viewId: ModuleId): void {
  const documentId = moritzDocumentIdForView(viewId);
  useAppStore.getState().setModule(viewId);
  ctx.dispatch({
    type: 'setActiveDocument',
    moduleId: MORITZ_MODULE_ID,
    documentId,
  });
  ctx.dispatch({
    type: 'setSelection',
    cObjectId: moritzSelectedIdForView(viewId),
  });
}

function MoritzViewport(props: { viewId: ModuleId }): ReactElement {
  if (props.viewId === 'bubblesetter') return <BubbleSetterStage />;
  if (props.viewId === 'stylesetter') return <StyleSetterStage />;
  if (props.viewId === 'typesetter') return <TypeSetterStage />;
  return <GlyphSetterStage />;
}

function MoritzLeftbar(props: { ctx: cBindingContext }): ReactElement {
  const viewId = activeMoritzView(props.ctx);
  return (
    <div className={`mz-suite-leftbar mz-suite-leftbar--${viewId}`}>
      <MoritzViewTabs
        viewId={viewId}
        onSelect={(nextView) => setActiveMoritzView(props.ctx, nextView)}
      />
      <div className="mz-suite-leftbar__panel">
        <MoritzOutliner viewId={viewId} />
      </div>
      <div className="mz-suite-leftbar__panel mz-suite-leftbar__panel--attrs">
        <MoritzAttrs viewId={viewId} />
      </div>
    </div>
  );
}

function MoritzViewTabs(props: {
  viewId: ModuleId;
  onSelect: (viewId: ModuleId) => void;
}): ReactElement {
  return (
    <div className="m-bar-tabs mz-suite-tabs" role="tablist">
      {moritzViewIds.map((viewId) => {
        const active = viewId === props.viewId;
        return (
          <button
            key={viewId}
            type="button"
            role="tab"
            aria-selected={active}
            className={`m-bar-tab mz-suite-tabs__tab${active ? ' is-active' : ''}`}
            style={viewTabStyle(viewId)}
            onClick={() => props.onSelect(viewId)}
          >
            <MoritzLabel text={VIEW_LABELS[viewId]} size={12} />
          </button>
        );
      })}
    </div>
  );
}

function viewTabStyle(viewId: ModuleId): CSSProperties {
  const skin = moritzViewSkins[viewId];
  return {
    background: skin.bg,
    color: skin.fg,
    borderColor: skin.fg,
  };
}

function MoritzOutliner(props: { viewId: ModuleId }): ReactElement {
  if (props.viewId === 'bubblesetter') return <BubbleSetterOutliner />;
  if (props.viewId === 'stylesetter') return <StyleSetterOutliner />;
  if (props.viewId === 'typesetter') return <TypeSetterOutliner />;
  return <GlyphSetterOutliner />;
}

function MoritzAttrs(props: { viewId: ModuleId }): ReactElement {
  if (props.viewId === 'bubblesetter') return <BubbleSetterAttrs />;
  if (props.viewId === 'stylesetter') return <StyleSetterAttrs />;
  if (props.viewId === 'typesetter') return <TypeSetterAttrs />;
  return (
    <div className="mz-suite-leftbar__glyph-attrs">
      <GlyphSetterAttrs />
      <GlyphSetterItemAttrs />
    </div>
  );
}

function MoritzWorkbenchSettings(props: { viewId: ModuleId }): ReactElement {
  return (
    <div className={`mz-workbench-settings mz-workbench-settings--${props.viewId}`}>
      {props.viewId === 'glyphsetter' && (
        <>
          <FontBar />
          <GlyphEditorToolbar />
        </>
      )}
      {props.viewId === 'bubblesetter' && <BubbleBar />}
      {props.viewId === 'stylesetter' && <StyleBar />}
      {props.viewId === 'typesetter' && <PageBar />}
    </div>
  );
}

function ProductGraphViewport(props: { ctx: cBindingContext }): HTMLElement | null {
  const doc = props.ctx.displayedDocument;
  if (!doc) return null;
  const skins = cDocumentById(props.ctx.state, 'skins')?.tree;
  return MTreeGraph({
    tree: doc.tree,
    selectedId: props.ctx.state.selectionId,
    onSelect: (id) => props.ctx.dispatch({ type: 'setSelection', cObjectId: id }),
    onNodeDrag: (id, pos) => props.ctx.dispatch(cPatchPositionAction(doc.id, id, pos)),
    onSetUserOffset: (id, x, y) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: setRadialNodeOffsetOn(doc.tree, id, x, y) }),
    onSetUserRotation: (id, rad) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: setRadialNodeRotationOn(doc.tree, id, rad) }),
    onToggleCollapse: (id) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: cToggleCollapse(doc.tree, id) }),
    onSetImportance: (id, value) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: cSetImportance(doc.tree, id, value) }),
    skins,
  });
}

function AnitaViewport(props: { ctx: cBindingContext }): HTMLElement | null {
  const doc = props.ctx.displayedDocument;
  if (!doc) return null;
  const skins = cDocumentById(props.ctx.state, 'skins')?.tree;
  if (!anitaProjectStatus.ok && doc.id === ANITA_ALERT_DOCUMENT_ID) {
    return MProjectAlert({ alert: doc.tree, skins });
  }
  return AnitaTreesView({
    tree: doc.tree,
    selectedCObjectId: props.ctx.state.selectionId,
    onSelectCObject: (id) => props.ctx.dispatch({ type: 'setSelection', cObjectId: id }),
    onNodeDrag: (id, pos) => props.ctx.dispatch(cPatchPositionAction(doc.id, id, pos)),
    onSetUserOffset: (id, x, y) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: setRadialNodeOffsetOn(doc.tree, id, x, y) }),
    onSetUserRotation: (id, rad) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: setRadialNodeRotationOn(doc.tree, id, rad) }),
    onToggleCollapse: (id) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: cToggleCollapse(doc.tree, id) }),
    onSetImportance: (id, value) =>
      props.ctx.dispatch({ type: 'updateActiveTree', tree: cSetImportance(doc.tree, id, value) }),
    skins,
  }) ?? null;
}

interface LeftbarSpec {
  readonly ownerTag?: string;
  readonly docIds?: readonly string[];
  readonly defaultDocId?: string;
}

const LEFTBAR_BY_MODULE: Readonly<Record<string, LeftbarSpec>> = {
  sigrid: {
    docIds: [
      moritzDocumentIds.glyphsetter,
      moritzDocumentIds.bubblesetter,
      moritzDocumentIds.stylesetter,
      moritzDocumentIds.typesetter,
    ],
    defaultDocId: moritzDocumentIds.glyphsetter,
  },
  magdalena: {
    docIds: [APP_DOCUMENT_ID, 'skins', REGISTRY_DOCUMENT_ID],
    defaultDocId: APP_DOCUMENT_ID,
  },
  anita: anitaProjectStatus.ok
    ? { ownerTag: 'anita', defaultDocId: ANITA_FUNCTIONAL_DOCUMENT_ID }
    : { ownerTag: 'anita', docIds: [ANITA_ALERT_DOCUMENT_ID], defaultDocId: ANITA_ALERT_DOCUMENT_ID },
};

function ProductTreeBrowser(props: { ctx: cBindingContext }): HTMLElement | null {
  const moduleId = props.ctx.state.activeModuleId;
  const spec = LEFTBAR_BY_MODULE[moduleId] ?? {};
  const docIds = spec.docIds;
  const skins = cDocumentById(props.ctx.state, 'skins')?.tree;
  const registry = cDocumentById(props.ctx.state, REGISTRY_DOCUMENT_ID)?.tree;
  const allDocs = props.ctx.documents.map((doc) => ({
    id: doc.id,
    name: doc.name,
    tree: doc.tree,
  }));
  const visible = docIds ? allDocs.filter((doc) => docIds.includes(doc.id)) : allDocs;
  const pickedId =
    props.ctx.state.activeDocumentByModule[moduleId] ??
    spec.defaultDocId ??
    visible[0]?.id ??
    '';
  return MTreeBrowser({
    trees: visible,
    ownerTag: spec.ownerTag,
    pickedId,
    onPick: (id) => {
      props.ctx.dispatch({ type: 'setActiveDocument', documentId: id });
      const picked = visible.find((doc) => doc.id === id);
      props.ctx.dispatch({ type: 'setSelection', cObjectId: picked?.tree.cId });
    },
    selectedId: props.ctx.state.selectionId,
    onSelect: (id) => props.ctx.dispatch({ type: 'setSelection', cObjectId: id }),
    onToggleCollapse: (id) => {
      const picked = visible.find((doc) => doc.id === pickedId);
      if (!picked) return;
      props.ctx.dispatch({
        type: 'replaceDocument',
        documentId: picked.id,
        tree: cToggleCollapse(picked.tree, id),
      });
    },
    onSetImportance: (id, value) => {
      const picked = visible.find((doc) => doc.id === pickedId);
      if (!picked) return;
      props.ctx.dispatch({
        type: 'replaceDocument',
        documentId: picked.id,
        tree: cSetImportance(picked.tree, id, value),
      });
    },
    skins,
    registry,
  });
}
