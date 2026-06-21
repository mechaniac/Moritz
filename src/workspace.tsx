import type { CSSProperties, ReactElement } from 'react';
import type { MBinding, MWorkspaceManifest } from '@christof/magdalena/workspace';
import {
  cActiveWhenModule,
  createCObject,
  createCWorkbench,
  type cBindingContext,
  type cModule,
  type cWorkspaceConfig,
} from '@christof/sigrid/core';
import {
  MORITZ_MODULE_ID,
  moritzModuleSkin,
  moritzViewSkins,
} from './moduleSkins.js';
import { BubbleSetterAttrs, BubbleSetterOutliner, BubbleSetterStage } from './modules/bubblesetter/BubbleSetter.js';
import { GlyphSetterAttrs, GlyphSetterItemAttrs, GlyphSetterOutliner, GlyphSetterStage } from './modules/glyphsetter/GlyphSetter.js';
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

export const moritzModule: cModule = {
  id: MORITZ_MODULE_ID,
  skin: moritzModuleSkin,
  gateway: {},
};

export const moritzModules: readonly cModule[] = [moritzModule];

const moritzViewportBinding: MBinding = {
  id: 'moritz.viewport',
  slot: 'viewport',
  activeWhen: cActiveWhenModule(MORITZ_MODULE_ID),
  render: (ctx) => <MoritzViewport viewId={activeMoritzView(ctx)} />,
};

const moritzLeftbarBinding: MBinding = {
  id: 'moritz.leftbar',
  slot: 'leftbar',
  activeWhen: cActiveWhenModule(MORITZ_MODULE_ID),
  render: (ctx) => <MoritzLeftbar ctx={ctx} />,
};

const moritzWorkbenchSettingsBinding: MBinding = {
  id: 'moritz.workbenchSettings',
  slot: 'workbenchSettings',
  activeWhen: cActiveWhenModule(MORITZ_MODULE_ID),
  render: (ctx) => <MoritzWorkbenchSettings viewId={activeMoritzView(ctx)} />,
};

const moritzBindings: readonly MBinding[] = [
  moritzViewportBinding,
  moritzLeftbarBinding,
  moritzWorkbenchSettingsBinding,
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
      id: 'workbench',
      name: 'workbench',
      build: () => createCWorkbench(),
    },
    {
      id: 'skins',
      name: 'skins',
      build: createMoritzSkins,
    },
  ],
  bindings: moritzBindings.map((binding) => ({
    id: binding.id,
    slot: binding.slot,
  })),
  initial: {
    moduleId: MORITZ_MODULE_ID,
    documentByModule: {
      [MORITZ_MODULE_ID]: moritzDocumentIds.glyphsetter,
    },
    selectionId: moritzSelectedIdForView('glyphsetter'),
  },
};

export const moritzWorkspace: MWorkspaceManifest = {
  config: moritzWorkspaceConfig,
  bindings: moritzBindings,
};

function createMoritzSkins() {
  return createCObject({
    cId: 'magdalena:skins',
    kind: 'magdalena.skins',
    tags: ['magdalena', 'moritz'],
    children: [
      createCObject({
        cId: `magdalena:skin:${MORITZ_MODULE_ID}`,
        kind: 'magdalena.skin',
        tags: ['magdalena', 'moritz'],
        extras: moritzModuleSkin,
      }),
    ],
  });
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
  const editorScale = useAppStore((s) => s.glyphView.editorScale);
  const setGlyphView = useAppStore((s) => s.setGlyphView);
  return (
    <div className={`mz-workbench-settings mz-workbench-settings--${props.viewId}`}>
      {props.viewId === 'glyphsetter' && (
        <>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--mz-text-mute)',
            }}
          >
            <MoritzLabel text="Zoom" size={12} />
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={editorScale}
              onChange={(event) =>
                setGlyphView({ editorScale: Number(event.target.value) })
              }
              className="mz-shell__zoom-slider"
              style={{ width: 120 }}
            />
          </label>
          <FontBar />
        </>
      )}
      {props.viewId === 'bubblesetter' && <BubbleBar />}
      {props.viewId === 'stylesetter' && <StyleBar />}
      {props.viewId === 'typesetter' && <PageBar />}
    </div>
  );
}
