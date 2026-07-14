# Workbench Unification Plan

Status: Phases 1–3 implemented in working tree; Phase 4 scaffolded; Phase 5 unblocked
Date: 2026-07-14

## Platform Requirements (for mother)

What Moritz needs implemented in sigrid/magdalena. Items 2–3 below are
Moritz-side integration work included for context — they do NOT require
platform changes.

### 1. Undo/redo — DELIVERED (commits 31000f9, bae77e4)

Per-document undo/redo is now available in the workspace runtime:
- `runtime.undo(documentId)` / `runtime.redo(documentId)`
- Configurable history limit (default 100 steps)
- Redo invalidation after divergent edits
- Grouping API: `beginHistoryGroup(documentId)` / `endHistoryGroup(documentId)`
  for continuous gestures (drag, slider)
- Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z keyboard routing to active document
- Native undo preserved in inputs/textareas/editables

**Moritz integration notes:**
- Wrap pointer drags and slider gestures in `beginHistoryGroup` /
  `endHistoryGroup` so the full gesture is one undo step
- Each `onTreeChange` dispatch = one history entry (unless grouped)
- No persistence of history across reloads (in-memory, which is fine)

This was the sole platform blocker for Phase 5. It is now resolved.

### 2. Persistence — NO PLATFORM CHANGE NEEDED

Moritz will self-serve using the existing `onRuntimeDocumentChange` callback
and `runtime.dispatch({ type: 'replaceDocument', ... })`. This is Moritz
integration work, not a platform ask.

### 3. Tree change notification — ALREADY WORKS

`runtime.subscribe()` fires after document changes. Confirmed working.

### 4. `ParamKind: 'file'` — REQUESTED (blocks import in Phase 7)

File import (font JSON, style JSON, page JSON) currently uses hidden
`<input type="file">` elements. Moving import into the gateway rightbar
requires a file-picker parameter kind.

**Minimum viable contract:**
```ts
// In ParamKind union:
type ParamKind = ... | 'file';

// ParamSpec additions for kind === 'file':
interface ParamSpec {
  accept?: string;  // e.g. '.json,application/json'
}
```

**Expectations:**
- Magdalena renders a file input (button or drop zone) for `kind: 'file'`
- The arg value delivered to `onFunctionCall` is the `File` object (or its
  string content — either works, Moritz will `.text()` it anyway)
- Single file only (no multi-select needed)

**Priority:** Low. Import works fine in the leftbar today. This is a
consistency improvement, not a blocker.

### 5. Gateway scoping — REQUESTED (nice-to-have)

Moritz has 4 views (Glyphs/Bubbles/Styles/Pages) each needing different
gateway functions. The platform's `spaces` filter only supports `"2d"` /
`"3d"`, so Moritz mutates `moritzModule.gateway` on every view switch.

**Any one of these would replace the workaround:**

a. **`visibleWhen` on PublicFn** — a predicate like bindings have:
   ```ts
   interface PublicFn {
     visibleWhen?: (ctx: { tree: cObject; selectedId?: string }) => boolean;
   }
   ```

b. **Module-level `computeGateway`** — called by the shell on render:
   ```ts
   interface cModule {
     computeGateway?: (ctx: { tree: cObject }) => Record<string, PublicFn>;
   }
   ```

c. **Arbitrary `spaces` values** — let `readWorkbenchView` accept strings
   set on the tree by the module (not just `"2d"` / `"3d"`).

**Priority:** Low. The mutation workaround functions correctly.

---

**TL;DR for mother:** Undo/redo delivered — thank you. Phase 5 is now
unblocked. Only `ParamKind: 'file'` (low priority) remains outstanding.

## Current State (working tree, uncommitted)

### What's implemented

- **Per-view gateway** — `moritzModule.gateway` is rebuilt dynamically on view
  switch via `updateMoritzGateway(viewId)`. GlyphSetter gets persistence +
  editing commands; BubbleSetter/StyleSetter/TypeSetter get persistence;
  StyleSetter gets 16 live sliders with `computeDefault`.
- **Function call handler** — `moritzFunctionCallHandler` intercepts all
  gateway calls and dispatches to Zustand. Returns `true` to suppress
  magdalena's default tree-transform path.
- **Kind schemas** — 8 cObject kinds registered via `registerCKindSchema`.
  Most fields are read-only; glyph box width/height have write adapters
  targeting Zustand.
- **Floating attributes enabled** — `chrome.floatingAttributes: true`.
- **Chrome** — HUD and workbench tab remain suppressed.

### What's NOT done

- Leftbar attrs panels still exist (Phase 6 — needs UX parity confirmation)
- Field writes still target Zustand (Phase 5 prerequisite)
- No tests for gateway handler, view switching, or field schemas
- Gateway switching via mutation is brittle (no focused tests)
- Import remains in the leftbar (no `ParamKind: 'file'`)
- All work is uncommitted

### The dual-state model (unchanged)

`buildMoritzWorkbenchProps` (workbench-props.tsx line 44) reconstructs the
displayed tree from Zustand on every render. Tree mutations via `onTreeChange`
are written to the workspace document but overwritten on the next render cycle.
Gateway functions are therefore declaration-only; actual execution is always
intercepted.

### Bindings

Moritz registers **two** bindings:
- `moritz.viewport` → custom glyph/bubble/style/page canvas
- `moritz.leftbar` → custom outliner + view tabs + attrs panels

## Architecture (How The Platform Works)

### The cModule contract (sigrid `core/types.ts`)

```
cModule {
  id: string                    — topbar identity
  skin: { bg, fg }              — one colour pair; magdalena derives everything else
  gateway: Record<string, PublicFn>  — public functions shown in rightbar
  functionGroups?: PublicFunctionGroup[]  — grouped functions (call stacks)
  chrome?: { hud, floatingAttributes, workbenchTab }  — per-module chrome policy
}
```

When a module is **active**, magdalena:
1. Paints the shell in the module's `skin`.
2. Populates the rightbar "functions" tab with the module's `gateway` entries
   (filtered by `spaces` — see constraint below).
3. Shows the "workbench" tab (separate from gateway) with `makeWorkbench()`
   functions (setView, setNodeShape, setSkin) unless
   `chrome.workbenchTab === false`.
4. Shows the HUD (view mode, transform hotkeys) unless `chrome.hud === false`.
5. Shows floating attributes for the selected cObject (via `getCFields()` on
   the node's registered kind) unless `chrome.floatingAttributes === false`.
6. Resolves bindings for viewport/leftbar/settings by matching the active
   module id.

### The `spaces` filter — CRITICAL CONSTRAINT

`mPublicFunctionEntriesForRightbar` in `shell.tsx` (~line 981) filters gateway
functions:
```ts
.filter(([, fn]) => !fn.spaces || fn.spaces.includes(space))
```
where `space` = `readWorkbenchView(tree)` which returns **only `"2d"` or
`"3d"`** (from `tree.extras?.["workbenchView"]`).

**Consequence:** `spaces: ['glyphsetter']` will NEVER match. Functions
declaring such spaces would be permanently hidden. The `spaces` mechanism
cannot be used to scope functions to Moritz views.

### The binding contract (sigrid `core/binding.ts`)

```
cBinding {
  id: string
  slot: 'topbar' | 'leftbar' | 'viewport' | 'rightbar' | 'workbenchSettings' | 'floating' | ...
  activeWhen?: (ctx) => boolean
  render: (ctx) => Element
}
```

### The gateway contract (sigrid `core/types.ts`)

A `PublicFn` is a pure `(tree, args) → tree` function with declared params.
Magdalena auto-renders an inspector card per entry: sliders for numbers,
toggles for booleans, dropdowns for enums, etc. The module author declares the
function; the platform renders the UI.

**ParamKind** supports: `number`, `integer`, `string`, `boolean`, `enum`,
`vec3`, `color`, `cObjectRef`, `scalar01`, `selection`.

**No `file` ParamKind exists.** Import/export operations requiring file pickers
cannot be expressed as standard gateway function parameters.

### The floating attributes inspector

Implemented in `magdalena/src/shell/floating-panel.tsx` (draggable card) with
field rendering in `magdalena/src/panels/inspector.tsx`.

The inspector calls `getCFields(node.kind, moduleId)` to get registered fields.
**Fields must be explicitly registered via `registerCKindSchema()`.**
Merely putting typed values in cObject `extras` or `components` produces NO
controls. If nothing is registered for a node's kind, the inspector renders
nothing.

### The workbench settings slot

The docked panel below the viewport. Currently removed for Moritz. Sigrid uses
it for graph-view switcher / layout controls.

### The dual-state problem — PRINCIPAL BLOCKER

`buildMoritzWorkbenchProps` (workbench-props.tsx line 43) sets `tree` to
`moritzTreeForView(viewId)` on every render. This function reads Zustand
stores fresh each time and builds a new cObject tree.

Even if `onTreeChange` writes a modified tree to the workspace document, the
**next render reconstructs the tree from Zustand**, discarding the document's
tree entirely.

**Consequence:** Pure `(tree, args) → tree` gateway functions cannot work as
tree transforms today. Any tree modifications are overwritten on the next
render cycle. Gateway functions must either:

1. Be intercepted by `onFunctionCall` and dispatched to Zustand stores; or
2. Wait until the cObject tree becomes the authoritative state (Phase 5).

## Analysis: What Moritz Actually Needs

### Truly unique to Moritz (must remain custom)

1. **Viewport**: the SVG glyph/bubble/style/page canvas with Illustrator-style
   spline editing. No platform equivalent exists. This stays as a viewport
   binding.

2. **GlyphSetter spline interactions**: anchor dragging, handle manipulation,
   stroke selection, multi-stroke selection. These are pointer-event handlers
   on the custom canvas — not expressible as gateway functions.

3. **View switching (Glyphs/Bubbles/Styles/Pages)**: Moritz is four editors in
   one module. The view tabs in the leftbar currently switch between them.

### Should use platform (gateway functions)

4. **Font save/load/import/export** (currently `FontBar`): These are
   imperative actions, not tree transforms. They should be gateway functions
   with `callMode: "manual"` — the rightbar renders a "save" / "load" /
   "import" / "export" button for each.

5. **Bubble font save/load/import/export** (currently `BubbleBar`): Same
   pattern.

6. **Style save/load/import/export** (currently `StyleBar`): Same pattern.

7. **Page save/load/import/export** (currently `PageBar`): Same pattern.

8. **GlyphSetter actions** (currently `GlyphEditorToolbar`): Add stroke, add
   anchor, delete selected, flip H, flip V. These ARE tree transforms —
   natural gateway functions.

### Should use platform (floating attributes / cObject fields)

9. **Style sliders** (Slant, Scale X/Y, stroke width, caps, etc.): Currently
   rendered in the leftbar attrs panel. These are per-selected-object
   attributes — they should live on the cObject as typed extras/components so
   the platform floating attributes panel renders them automatically.

10. **Glyph metrics** (box width, box height, advance): Same — cObject fields.

11. **Stroke properties** (width profile, cap overrides): Same — cObject
    fields on the stroke cObject.

### Should use platform (but needs platform work first)

12. **Moritz view tabs (Glyphs/Bubbles/Styles/Pages)**: These could be exposed
    as four documents under the moritz module. Magdalena's document-tabs system
    would render them. However, this requires platform support for per-module
    document tabs that is not yet implemented — today the topbar only switches
    modules, not documents within a module.

## Chrome Policy

Configured in `workspace.tsx` (line ~84):

| Chrome element | Current | Notes |
|---|---|---|
| `hud` | **false** | Sigrid viewport transform verbs, irrelevant to Moritz. |
| `floatingAttributes` | **true** | Enabled — kind schemas registered for glyph/stroke/anchor/bubble/page. |
| `workbenchTab` | **false** | Sigrid layout/render verbs, irrelevant to Moritz. |

## Proposed Next Steps (Revised)

### Phase 1: Intercepted gateway commands for synchronous actions

Expose simple Moritz operations as `cModule.gateway` entries. All calls are
intercepted by `moritzFunctionCallHandler` and dispatched to Zustand stores —
gateway functions serve purely as UI declarations, not as tree transforms.

**View-scoping strategy:** Since `spaces` only supports `"2d"` / `"3d"`,
function visibility must be handled differently. Options:

a. **Rebuild gateway dynamically** on view switch — `moritzModule.gateway` is
   recomputed when the active Moritz document changes. Requires re-assigning
   the gateway object or a module refresh mechanism.

b. **Single gateway, handler rejects irrelevant calls** — expose all functions;
   `moritzFunctionCallHandler` checks the current view and returns `false` for
   functions not applicable to the current view. The rightbar shows all
   functions but irrelevant ones fail silently.

c. **`visibility: 'private'` toggling** — mark functions whose view is not
   active as `visibility: 'private'` in a computed gateway. Same as (a) but
   uses existing visibility filtering.

**Recommended: option (a)** — rebuild the gateway record when
`activeDocumentByModule[MORITZ_MODULE_ID]` changes. This keeps the rightbar
clean without platform changes.

**What goes into Phase 1:**

```ts
gateway: {
  // Persistence (intercepted side effects)
  saveFont:     { callMode: 'manual', params: [{ name: 'name', kind: 'string' }] },
  loadFont:     { callMode: 'manual', params: [{ name: 'id', kind: 'enum', computeOptions: ... }] },
  deleteFont:   { callMode: 'manual', params: [{ name: 'id', kind: 'enum', computeOptions: ... }] },
  exportFont:   { callMode: 'manual', params: [] },
  // Same pattern for bubble/style/page...
}
```

**What does NOT go into Phase 1:**

- **Import functions** — `ParamKind` has no `file` type. Import requires either
  a custom binding/control, a new platform `ParamKind`, or a handler that opens
  a file picker. Keep import in the custom leftbar for now.
- **Glyph editing (addStroke, flipH, etc.)** — these are tree transforms but
  the dual-state problem means they can't work as pure functions yet. They must
  be intercepted and dispatched to Zustand just like persistence. Defer to
  Phase 3 or implement immediately with full interception awareness.

**Persistence UX considerations:**
- One gateway card per save/load/delete/export produces a noisy rightbar.
  Consider using `functionGroups` to group them, or a single "persistence"
  function with a `kind: 'enum'` action parameter.
- Persistence handlers need: confirmation dialogs (delete/overwrite), disabled
  states (can't save without name), async error handling, and computed option
  list refresh after save/delete.

### Phase 2: Glyph editing as intercepted gateway commands

Once Phase 1 confirms the interception pattern works, add glyph editing:

```ts
addStroke:      { callMode: 'manual', params: [] },
addAnchor:      { callMode: 'manual', params: [] },
deleteSelected: { callMode: 'manual', params: [] },
flipH:          { callMode: 'manual', params: [] },
flipV:          { callMode: 'manual', params: [] },
```

These are dispatched to Zustand via `moritzFunctionCallHandler`. They appear
as buttons in the rightbar. The operations already exist in
`modules/glyphsetter/`; the handler calls them.

**Important:** These are NOT pure tree transforms in Phase 2. They only become
pure `(tree, args) → tree` after Phase 5 (cObject tree becomes authoritative).

### Phase 3: Style sliders as intercepted gateway functions

StyleSetter sliders (Slant, Scale X/Y, stroke width, world blend, caps)
declared as `callMode: 'live'` gateway functions:

```ts
setSlant:       { callMode: 'live', params: [{ name: 'value', kind: 'number', min: -0.5, max: 0.5, step: 0.01 }] },
setScaleX:      { callMode: 'live', params: [{ name: 'value', kind: 'number', min: 0.5, max: 2, step: 0.01 }] },
setStrokeWidth: { callMode: 'live', params: [{ name: 'value', kind: 'number', min: 1, max: 20, step: 0.5 }] },
```

The rightbar renders these as sliders automatically. The handler intercepts
and dispatches to Zustand stores.

**Caveat:** "Memoization is free" is not accurate. Purity makes memoization
*possible*; it does not provide it automatically. React `useMemo` / Zustand
selectors are still needed for performance.

### Phase 4: cObject field registration (medium-term)

Register Moritz cObject kinds with the platform so the floating attributes
inspector renders meaningful controls.

**Required steps:**

1. Define stable Moritz cObject kinds: `cnode.moritz.glyph`,
   `cnode.moritz.stroke`, `cnode.moritz.anchor`, `cnode.moritz.bubble`,
   `cnode.moritz.bubbleLayer` (these are the actual registered kind strings).

2. Call `registerCKindSchema()` for each kind:
   ```ts
   registerCKindSchema({
     moduleId: 'moritz',
     kind: 'cnode.moritz.stroke',
     fields: [
       { name: 'width', kind: 'number', min: 0.5, max: 20, read: ..., write: ... },
       { name: 'capStart', kind: 'enum', options: ['round','flat','tapered'], read: ..., write: ... },
     ],
   });
   ```

3. Implement field `read` / `write` adapters. Decision required: do writes
   update the cObject tree, Zustand, or both? Until Phase 5, writes must
   target Zustand (same dual-state constraint).

4. Re-enable `chrome.floatingAttributes: true`.

**Note:** Fields registered here DO NOT auto-generate from `extras` values.
Every visible control requires an explicit schema registration.

### Phase 5: cObject tree becomes authoritative (long-term)

Move moritz font/style/bubble/page state from Zustand stores onto the cObject
tree. Each moritz document (moritz.font, moritz.bubbleFont, etc.) IS the
authoritative cObject tree. `moritzTreeForView()` stops rebuilding from Zustand
— it returns the workspace document's tree directly.

Gateway functions become true `(tree, args) → tree`.

**Prerequisites:**
- **Undo/redo** — ✓ delivered. Runtime provides per-document history with
  grouping API for gestures.
- **Persistence** — Moritz-side work. Use existing `onRuntimeDocumentChange`
  hook + localStorage adapter. No platform API needed.
- **Change notification** — already works. `runtime.subscribe()` fires on
  document changes.

All prerequisites are now met. Phase 5 is unblocked.

### Phase 6: Leftbar simplification (after Phase 4-5)

Once gateway functions handle operations and cObject fields handle attributes,
the moritz leftbar reduces to:

- View tabs (Glyphs/Bubbles/Styles/Pages) — custom, stays
- Outliner — currently uses Moritz-specific outliner components (not
  "MOutliner platform default"). Define migration target: either adopt
  magdalena's outliner with Moritz tree adapters, or keep the current
  Moritz outliner in the leftbar binding.

The current `GlyphSetterAttrs`, `StyleSetterAttrs`, `BubbleSetterAttrs`,
`TypeSetterAttrs` components become unnecessary — their controls live in the
rightbar (gateway functions) and floating panel (cObject fields).

### Phase 7: Import and complex persistence (when platform supports it)

Full file import/export requires one of:
- A new `ParamKind: 'file'` in sigrid (platform change).
- A custom gateway control binding that renders `<input type="file">`.
- A handler that opens a native file picker (still makes the gateway entry
  just a command trigger).

Until then, import stays in the custom leftbar or a custom binding.

## Folder & Module Structure (Target)

```
src/
  core/                         # PURE domain math. No DOM, no React, no stores.
    types.ts                    # Domain types (Font, Glyph, Style, Bubble, Page)
    bezier.ts                   # Bézier math
    stroke.ts                   # Stroke outline computation
    transform.ts                # Style → affine → vertex transform
    layout.ts                   # Text layout
    ...
    gateway/                    # TRANSITIONAL: gateway declarations + handler.
                                # Imports Zustand stores and persistence modules.
                                # Will become pure once Phase 5 makes the tree
                                # authoritative; until then, handler interception
                                # requires store access.
      moritzGateway.ts          # Per-view PublicFn declarations
      moritzFunctionCallHandler.ts  # Dispatch table (side-effectful)
      moritzKindSchemas.ts      # registerCKindSchema calls (side-effectful)
    export/
      svg.ts
      png.ts
  data/                         # Built-in fonts, styles, presets
  state/                        # Zustand stores (shrinks as state migrates to cObject tree)
  modules/
    glyphsetter/                # THIN: viewport component + pointer handlers only
    bubblesetter/
    stylesetter/
    typesetter/
  ui/                           # Shared React components (MoritzSelect, MoritzText)
    canvas/                     # Shared canvas hooks
  workspace.tsx                 # cModule + gateway + bindings + documents
  workspaceTrees.ts             # cObject tree builders
```

**Note on `core/gateway/`:** This directory currently violates the "core is
pure" rule — it imports Zustand stores, persistence modules, and performs
browser I/O (download blobs, localStorage). This is a transitional state.
Once Phase 5 makes the cObject tree authoritative, the handler becomes a
pure `(tree, args) → tree` function and the store imports disappear. Until
then, the handler currently lives here because it's the only place that knows
both the gateway declarations and the store dispatch logic. An alternative
would be `src/adapters/` or `src/integration/` — the placement is a
convenience choice, not a necessity.

## What Each Layer Provides (Target)

```
sigrid     → cObject tree, cModule contract, workspace state, bindings, services
             transform, hierarchy, selection, workbench grid layout

magdalena  → mounted workbench shell, topbar, outliner, rightbar (gateway inspector),
             floating attributes (via getCFields + registerCKindSchema),
             HUD, skins, word weights, importance, interface tree
             ALL rendering of controls: sliders, buttons, toggles, dropdowns, cards

moritz     → viewport binding (custom canvas), leftbar binding (view tabs + outliner),
             gateway functions (intercepted by handler → Zustand dispatch),
             cObject tree builders (font→glyph→stroke→anchor),
             registerCKindSchema() registrations for inspector fields,
             pure domain math (bezier, stroke outline, layout, transform)
```

## Blocking Dependencies

| Dependency | Blocks | Resolution |
|---|---|---|
| `spaces` only supports `"2d"`/`"3d"` | Declarative function scoping | Workaround: mutate gateway on view switch (brittle, untested) |
| Dual-state (Zustand authoritative, tree derived) | Pure tree-transform functions | Intercept all calls via handler (Phases 1-3); make tree authoritative (Phase 5) |
| ~~No undo/redo runtime API~~ | ~~Phase 5~~ | **Delivered** — commits 31000f9, bae77e4 |
| Persistence for document trees | Phase 5 | Moritz can self-serve via `onRuntimeDocumentChange` + localStorage adapter |
| Tree change subscription | Phase 5 | Already works — `runtime.subscribe()` fires on document changes |
| No `ParamKind: 'file'` | Import as gateway function | Keep import in custom leftbar |
| No tests for gateway/handler/schemas | Commit readiness | Write tests before committing |

## Principles Check

- **Modularity**: Each layer has a clear boundary. Moritz provides domain math +
  gateway declarations + handler interception.
- **Extensibility**: New moritz operations = new gateway entries + handler cases.
  Platform renders UI automatically.
- **Stability**: The platform is the stable base. Moritz changes don't require
  further platform changes (undo/redo delivered; only `ParamKind: 'file'` for
  import remains outstanding).
- **Speed**: Purity makes memoization *possible*; explicit `useMemo` / Zustand
  selectors are still required for performance. Not automatic.
- **Single source of truth**: Zustand stores remain authoritative until Phase 5.
  The cObject tree is a derived view for the platform shell.
- **Functional programming**: Gateway declarations use the
  `PublicFn.call: (tree, args) → tree` shape, but actual execution is
  intercepted — the handler performs the real mutation on Zustand.
- **Sensible partitioning**: `core/gateway/` for function declarations, `core/`
  for math, `modules/` for thin viewport shells, `workspace.tsx` for
  composition and handler dispatch.
