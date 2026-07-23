# Channel: Moritz
<!-- STATUS: INTEGRATION IN PROGRESS -->

## Requests (child -> mother)

### RESOLVED | 2026-07-14 | Module isolation guarantees

All three guarantees are now structurally enforced in sigrid (commit `62d4422`):

1. **Binding priority** — `cBinding.moduleId` ownership. `cResolveBindings`
   prefers bindings owned by the active module before comparing numeric
   priority. A foreign binding cannot win a slot when the active module has an
   eligible binding for it.
2. **Default documents** — `cModule.defaultDocument` is auto-contributed to
   the workspace document list if the host doesn't provide one with that id.
   Every platform module gets its native document without host intervention.
3. **Validation** — `initialCWorkspaceState` validates `documentByModule`
   entries. Unknown document IDs log a warning and fall back to the module's
   declared default. The runtime throws if a module's document disappears
   after construction.

Moritz no longer needs the workaround of assigning a neutral `products` tree
to Sigrid — Sigrid will auto-create its own default document.

### RESOLVED | 2026-07-16 | Outliner grid-view mode

Shipped in commit `2cafed7`. `MOutlinerProps` now accepts:
- `viewMode?: "tree" | "grid"` (default `"tree"`, no behaviour change)
- `renderGridCell?: (node: cObject) => HTMLElement | null`
- `gridCellSize?: number` (default 64)

Grid mode renders `root.children` as a responsive CSS-grid of clickable cells.
Selection model, skins, and click-to-select are shared with tree mode. Moritz
should replace `IconGrid` with `MOutliner viewMode="grid"` and remove the
duplicate `GlyphCObjectOutliner` from the leftbar.
```

- **Tree mode** (default, current behavior) — nested hierarchy, text labels
- **Grid mode** — flat thumbnail grid, module provides `renderGridThumb`

Both modes share the same selection model, keyboard navigation, and cObject
tree. A toggle button in the outliner header switches views. The mode is a
per-module or per-document preference.

**Use cases beyond Moritz:**
- shapeAndPose: pose/shape thumbnails (screenshot-based)
- Material editors: texture/material swatches
- Animation editors: keyframe thumbnails
- Any module with visual assets that benefit from preview

**What Moritz will do immediately:**
- Remove the duplicate `GlyphCObjectOutliner` from the leftbar
- Keep `IconGrid` as the sole glyph selector (temporary, until MOutliner supports grid mode)
- Once shipped, replace `IconGrid` with `MOutliner viewMode="grid"`

### RESOLVED | 2026-07-16 | Floating attributes initial position — per-module config

Commit `9651edb`. `cModule.chrome.floatingAttributesPosition` now accepts
`{ left?, right?, top?, bottom? }`. Moritz sets:

```ts
chrome: {
  floatingAttributes: true,
  floatingAttributesPosition: { right: "56px", bottom: "32px" },
}
```

Remove the CSS override (`left: auto; right: 56px`). The panel remembers its
dragged position for the session; the config only sets the initial default.

### RESOLVED | 2026-07-14 | Leftbar layout contract

Fixed in commit `59fbddf`. `.m-workbench-bar__body` now uses `flex: 1 1 0`
with `min-height: 0` (the standard nested-flex fix). A single child with
`flex: 1 1 0; min-height: 0; overflow-y: auto` correctly fills the
available height. Moritz can remove its two-child workaround.

### RESOLVED | 2026-07-14 | Floating attributes position persistence

Fixed in commit `bdef219`. Dragged/resized position is written to the chrome
tree (`extras.floatingAttributesLayout.<moduleId>`) on pointer-up. On next
page load, the persisted layout is seeded from the chrome tree. The chrome
tree is saved/loaded by plan 12 (`workbench.christof.tree.json`), so
positions survive across sessions.

Priority order: persisted chrome > in-session drag > `chrome.floatingAttributesPosition` > CSS default.

### 2026-07-23 | Debug mode exposure for custom viewports — HIGH PRIORITY

Moritz has a custom viewport (not MTreeGraph). The workbench HUD debug button
currently only toggles `graphDebugEnabled` which feeds into `MTreeGraph`. Moritz
needs access to this toggle to show/hide its own debug overlays (stroke borders,
triangulation mesh, spine debug, normals).

**Request (pick one or both):**

1. **Expose `debugEnabled` in binding context** — add to `cBindingContext`:
   ```ts
   interface cBindingContext {
     debugEnabled: boolean;  // reads from the HUD debug toggle
   }
   ```
   Moritz's viewport binding reads this and conditionally renders debug overlays.

2. **`visibility: 'debug'` on `PublicFn`** — gateway functions with this
   visibility only appear in the rightbar when debug mode is active:
   ```ts
   interface PublicFn {
     visibility?: 'public' | 'private' | 'debug';
   }
   ```
   Filter: `fn.visibility !== 'debug' || debugEnabled`. This lets Moritz
   declare `toggleBorders`, `toggleTriangles`, `toggleSpline0`, `toggleSpline1`
   as debug-only functions.

**Why:** Moritz's debug overlays are essential for developing the rendering
pipeline but currently buried in a settings tab. The workbench debug button is
the natural toggle point — it's just not wired to custom viewport modules yet.

**Moritz side:** Will enable `chrome: { debug: true }` and wire debug overlays
to the exposed state as soon as the platform delivers either option.

### 2026-07-23 | Navigate-on-grid-click as platform default

When a grid cell is clicked, the universal expectation is: load that element
into the viewport. Currently each module manually wires this:

```ts
onSelect: (id) => {
  const char = charFromCObjectId(id, font);  // module-specific extraction
  if (char) selectGlyph(char);               // module-specific navigation
}
```

Every module with a grid outliner will need this same pattern. The platform
should provide navigate-on-click as default grid behavior.

**Proposed API:**
```ts
interface MOutlinerProps {
  gridSelectBehavior?: 'navigate' | 'select-only';
  // 'navigate' (default) — clicking a cell dispatches a "navigate to this
  //   element" action that the workspace runtime routes to the active module's
  //   viewport. The module declares how to map cId → viewport element.
  // 'select-only' — just update selection highlight, no viewport navigation.
}
```

**Alternative (simpler):** If full navigate routing is too complex, just ensure
`onSelect(child.cId)` is always called on grid-cell click (already works) and
document the convention that modules should handle navigation in their
`onSelect` handler. The current implementation already does this — the platform
just needs to ensure it's a stable, documented contract.

### 2026-07-23 | Glyph & bubble primitives in sigrid — DIRECTION

Moritz's role is **page composition**. The underlying primitives should live in
the platform:

1. **`@christof/sigrid/glyph`** — already partially shipped (2026-07-12).
   Moritz will migrate once outline parity is confirmed.

2. **`@christof/sigrid/bubble`** (new package request) — multi-layer spline
   bubble model. Types: `BubbleLayer`, `Bubble`, `BubbleFont`. Operations:
   loop/fill geometry, SVG render, bubble → cObject adapter.

   This enables any child project to create and render speech bubbles without
   depending on Moritz. Moritz keeps: BubbleSetter UI, bubble font management,
   persistence, page composition.

**Timeline:** Glyph migration is in flight (parity suite next). Bubble
extraction is lower priority — after glyph parity is confirmed and the pattern
is proven.

### 2026-07-20 | Grid-view icons as live workbench snapshots — HIGH PRIORITY

The MOutliner grid-view cells should be **live miniature workbench snapshots**,
not isolated thumbnails rendered separately by the module. This is a fundamental
shift in how grid icons work.

**Current problem:**
- Moritz's `renderGridCell` creates a standalone SVG per glyph with custom
  rendering logic — duplicating what the workbench viewport already draws.
- The grid icons don't reflect workbench settings (background color, guides,
  debug overlays). If the user changes the workbench, icons don't update.
- Each module must write custom thumbnail rendering code.

**Proposed model: view-gate icons**

Each workbench viewport has a **view gate** — a rectangular region that defines
what the grid icon should show. The grid icon is a live scaled-down rendering
of the viewport content within that gate. Like a camera viewport crop.

```
Workbench viewport (full size)
┌──────────────────────────────────────┐
│                                       │
│    ┌─────────┐  ← view gate          │
│    │  A      │     (per element)      │
│    │         │                        │
│    └─────────┘                        │
│                                       │
└──────────────────────────────────────┘

Grid icon = scaled snapshot of the view gate content
┌───┐
│ A │  ← same rendering, just smaller
└───┘
```

**Behavior:**
- Icons show exactly what the workbench shows: background, gridlines (at 1px),
  fill color, debug overlays — everything.
- Icons update live when the workbench changes (style edits, color changes).
- Icons try to represent real-world relative scale (a wide glyph has a wider
  icon, a tall bubble has a taller icon).
- The module defines the view gate bounds per element (e.g. glyph box, bubble
  bounding box). The platform handles the snapshot.
- Default: live workbench snapshot. Option: the current "floating element"
  style (isolated shape on transparent, like GlyphSetter currently has) as an
  alternative mode the user can switch to.

**What the platform should provide:**

1. **`MOutlinerGridCell` snapshot mode** — instead of `renderGridCell` returning
   arbitrary HTMLElements, the outliner can accept a viewport reference + a
   per-node bounding box, and render a scaled crop of the live viewport.

2. **View gate API** — the module declares the gate rect per cObject:
   ```ts
   interface MOutlinerProps {
     gridViewGate?: (node: cObject) => { x: number; y: number; w: number; h: number } | null;
   }
   ```
   The platform renders the viewport content within that rect into the cell.

3. **Grid cells fill available width** — cells should use responsive
   `auto-fill` + `minmax()` sizing without fixed inline dimensions (see
   existing request from 2026-07-19).

4. **Real-world scale representation** — cells may have varying aspect ratios
   based on the view gate. The grid should handle non-square cells gracefully
   (CSS grid with `auto` row heights + `aspect-ratio` from the gate).

**Why this matters beyond Moritz:**
- shapeAndPose: pose icons should show the same rendering as the viewport
  (skeleton overlay, mesh, lighting) — not a separate renderer.
- Any 3D module: material/texture previews should be live viewport crops.
- Eliminates module-specific thumbnail code entirely — the platform provides
  the rendering by reusing the viewport.

**Moritz's current workaround:**
`renderGridCell` creates a custom SVG per glyph with manual triangulation.
This is expensive (recalculates on every tree change), doesn't match the
viewport exactly (different fill colors, no guides, no debug overlays), and
requires ~40 lines of DOM manipulation code per module.

### RESOLVED | 2026-07-20 | Grid-view icons as live workbench snapshots (Phase A)

Phase A shipped in commit `f83115d`. SVG path rendering with aspect ratios.

### 2026-07-20 | Grid-view icons Phase B: true workbench miniatures

Phase A delivers SVG paths on a flat `--c-bg` background. But the icons
should be **actual miniature workbench viewports** — showing everything the
workbench shows:

1. **Workbench background** — the actual `--mg-bg` / canvas color, not a
   slightly-different cell outline color. The icon IS a window into the
   workbench.
2. **Grid lines** — the same grid/guides visible on the workbench, rendered
   at 1px in the miniature.
3. **Uniform world-space scale** — all cells in a grid use the SAME view gate
   dimensions (Moritz fixed this on its side by returning a standard box). But
   the platform should support a `gridViewGateUniform?: boolean` prop that
   computes the maximum gate across all nodes and applies it uniformly.
4. **Full-width filling** — cells stretch to fill the outliner width (already
   working with `auto-fill` + `minmax` + flexible sizing).

**What's needed from the platform:**

```ts
interface MOutlinerProps {
  // Phase A (done):
  gridViewGate?: (node: cObject) => MViewGate | null;
  gridViewGateRender?: (node: cObject) => readonly MViewGatePath[];

  // Phase B (requested):
  gridViewGateUniform?: boolean;  // use max(all gates) for every cell
  gridViewGateBackground?: boolean; // render workbench bg + gridlines in cells
}
```

When `gridViewGateBackground` is true, each cell renders:
- The workbench canvas background (`--mg-bg`)
- Module-registered gridlines/guides (scaled to the miniature)
- Then the SVG paths from `gridViewGateRender` on top

This makes icons truly "windows into the workbench" — edit the workbench
style/color/guides, and every icon updates to match.

### RESOLVED | 2026-07-19 | MOutliner grid cells flexible dimensions

Fixed in commit `a995f6d`. Cells now use `min-width`/`min-height` instead of
fixed `width`/`height`. Moritz can remove its `!important` CSS overrides.

### RESOLVED | 2026-07-19 | Bar header labels should word-weight / abbreviate

Fixed in commit `a1ed39d`. Bar handle labels now use `workbenchWordWeights`
(full workbench scope) instead of `chromeWordWeights` (chrome-only scope).
All bar headers and binding-rendered subcategory tabs participate in the
standard word-weighting system.

The "leftbar" and "rightbar" header labels are rendered by magdalena's shell
at a fixed size. At narrow widths or low importance, they should collapse to
abbreviations ("l" / "r") or hide entirely, consistent with how word-weighting
scales all other interface text.

**Request:** Make bar header labels participate in the standard word-weighting
system. At lowest importance, abbreviate to first letter or hide. This is the
same pattern used for module tab labels and function card headers.

### RESOLVED | 2026-07-19 | MOutliner grid cells should not have fixed inline dimensions

Fixed in commit `a995f6d`. Cells now use `min-width`/`min-height` + 
`aspect-ratio: 1`. The `1fr` grid tracks stretch cells to fill available width.
Remove `!important` overrides.

`MOutliner` grid cells have inline `style={{ width: ${cellSize}px, height: ${cellSize}px }}`.
This prevents CSS `auto-fill` + `1fr` from stretching cells to fill the
container width. The grid container already uses
`gridTemplateColumns: repeat(auto-fill, minmax(${cellSize}px, 1fr))` — but
the fixed cell dimensions fight the `1fr` expansion.

Moritz works around this with `!important` overrides:
```css
.m-outliner-grid__cell {
  width: auto !important;
  height: auto !important;
  aspect-ratio: 1;
}
```

**Request:** Change the cell inline styles from `width`/`height` to
`min-width`/`min-height` (or remove them entirely and let the grid track
sizing handle it). This lets cells stretch to fill available width, producing
a responsive grid with no horizontal overflow. The `gridCellSize` prop would
then only set the `minmax()` minimum, not a fixed size.

### 2026-07-14 | `ParamKind: 'file'` for import operations (low priority)

File import (font/style/page JSON) needs a file-picker gateway parameter.
Currently kept in the custom leftbar. Not blocking.

### 2026-07-14 | Gateway scoping beyond `"2d"`/`"3d"` (low priority)

`spaces` only matches `"2d"`/`"3d"`. Moritz works around this by mutating
`moritzModule.gateway` on view switch. A `visibleWhen` predicate or
`computeGateway` callback would be cleaner. Not blocking.

---

### RESOLVED | 2026-07-12 | Per-module chrome suppression

**Resolved.** `cModule.chrome` with `{ hud, floatingAttributes, workbenchTab }`
is implemented and Moritz uses it. HUD and workbench tab are suppressed;
floating attributes is enabled with registered kind schemas.

### RESOLVED | 2026-07-14 | Undo/redo runtime API

**Resolved** in commits `31000f9` and `bae77e4`. Per-document undo/redo with
history grouping API. Moritz Phase 5 (authoritative tree) is unblocked.

---

### 2026-07-11 | Typed 2D glyph/spline primitives needed

Moritz wants to be a thin editor shell where glyphs and splines are real sigrid
cObjects — not generic `group` nodes with role metadata in the adapter. Currently
sigrid has no 2D spline vocabulary. Here's what we need, roughly in priority order:

**1. Typed cKind schemas for 2D glyph data**

Register kinds like `moritz.stroke`, `moritz.glyph`, `moritz.anchor` (or
platform-generic equivalents like `sigrid.spline`, `sigrid.splineVertex`) so
the tree carries semantic meaning the viewport and inspector can act on without
Moritz-specific metadata unpacking.

**2. Canonical spline data types at platform level**

`Vertex` (point + in/out bezier handles), `Stroke` (ordered vertices + width
profile + cap shape), `WidthProfile` (t → width samples). These are the nuclear
data of every glyph, bubble layer, and future 2D paint. Moritz has them in
`src/core/types.ts`; they're ready for promotion.

**3. Variable-width stroke outline algorithm (sigrid-curves)**

The donation map referenced `@christof/sigrid-curves` — it doesn't exist yet.
Moritz has battle-tested outline math: `stroke.ts` (adaptive flatten + offset),
`widthEffects.ts` (jitter, taper, pressure), `effects.ts` (post-outline FX),
`relax.ts` (smooth), `ribbon.ts` (decorative ribbons). Ready to donate with
fixtures once there's a home package.

**4. 2D spline editing viewport in Magdalena**

`CViewport2D` today is a tree-graph viewport (pan/zoom + node drag). Moritz
needs a shared 2D editor viewport with: anchor/handle drag, tangent-handle
editing, stroke selection, width-profile handle overlay. Currently local in
`src/ui/canvas/*` and `src/editor/StrokeOverlay.tsx`.

**5. `ChristofProjectFile` facets for font/glyph/bubble data**

So persistence can switch from app-local JSON envelopes to sigrid documents.
Moritz currently stores: Font (glyphs, kerning, guides, style), BubbleFont
(bubbles with layers), Page (blocks with text runs), Style. Each could be one
sigrid document if there were accepted facet kind names.

---

**What Moritz can provide immediately:**

- Proven type definitions for Vertex, Stroke, WidthProfile, CapShape, Glyph
- Full test suite for outline math (18 stroke tests, 5 ribbon, 8 widthEffects,
  12 effects, 5 relax, 5 bubbleFill)
- Working cObject adapter mapping the full hierarchy:
  `font → glyph → animator? → stroke → anchor → handle`
- Working `CViewport2D`-compatible tree output from all four workspaces

**Original blocker (resolved 2026-07-12):**

The missing target package was resolved by `@christof/sigrid/glyph`. Moritz can
now start fixture-gated extraction using the notice below.

### RESOLVED | 2026-07-12 | Workbench chrome needs binding slots — per-module suppression

Resolved. `cModule.chrome` with `{ hud, floatingAttributes, workbenchTab }`
flags was implemented in magdalena. Moritz sets `hud: false, workbenchTab: false,
floatingAttributes: true` (with registered kind schemas). Original request below
for reference.

Moritz provides its own viewport, leftbar, and workbenchSettings via bindings.
But three pieces of workbench chrome are hardcoded in magdalena and cannot be
controlled per-module:

1. **HUD** (2D/q/e/r/object/debug toolbar) — always renders when any viewport
   is shown. Moritz doesn't use sigrid's transform tools; the HUD is noise.
2. **Floating attributes inspector** (cObject position/rotation/scale fields) —
   always renders for any selected node. When Moritz is active, this overlaps
   the Moritz settings bar and shows transform properties that don't apply to
   glyphs, bubbles, or pages.
3. **Rightbar "workbench" tab** (VIEW/GEOMETRY/SKIN functions) — always shows.
   These are scene-graph manipulation verbs. Moritz has its own editor verbs
   in the settings bar and leftbar attrs; the workbench tab adds irrelevant
   controls.

**What Moritz tried and reverted:**

We added `props.viewport !== undefined` guards to suppress all three in
magdalena's `shell.tsx`. This fixed Moritz but broke sigrid — sigrid also
provides a viewport binding (`productGraphViewportBinding`) and still needs the
HUD. The condition was too coarse; `viewport !== undefined` ≠ "suppress chrome".

**What we need from sigrid/magdalena:**

The correct mechanism is per-module chrome policy on `cModule` or as a binding:

```ts
// Option A: per-module chrome flags on cModule
type cModule = {
  id: string;
  skin: cModuleSkin;
  gateway: Record<string, cGatewayFunction>;
  chrome?: {
    hud?: boolean;              // default true — show 2D/3D/transform toolbar
    floatingAttributes?: boolean; // default true — show cObject transform inspector
    workbenchTab?: boolean;     // default true — show rightbar "workbench" tab
  };
};

// Option B: binding slots (consistent with viewport/leftbar/workbenchSettings)
// Register a binding with slot 'hud' or 'floatingAttributes' that replaces
// or returns null to suppress.
```

Option A is simpler and sufficient. Option B is more flexible (allows custom
HUDs) but we don't need that yet. Either way, the rule is: **each c app
mutates the outliner, the workbench (including its chrome), and the rightbar
to its liking.** The workbench is a canvas — modules paint on it. Moritz would
set `hud: false, floatingAttributes: false` and expose its own tools through
the existing `workbenchSettings` binding slot.

**What can be donated to sigrid (used by 2+ apps):**

The concept of a `workbenchSettings` bar (bottom toolbar with app-specific
controls) is Moritz-specific today but generalizable. Any app that provides a
custom viewport likely wants its own settings bar. The binding slot already
exists in magdalena — just needs to be documented as the standard pattern.

**Current workaround in Moritz:**

None — the floating attributes and HUD show unconditionally and overlap. We
accept the visual noise until magdalena adds per-module chrome policy.

---

### 2026-07-12 | Integration done + parity gaps documented

Moritz adapter now emits `sigrid.glyph`, `sigrid.stroke`, `sigrid.splineVertex`
cObjects (step 1–2 of the notice). Parity fixtures written in
`tests/core/stroke-parity.test.ts` (12 tests, all pass).

**Confirmed parity (both engines agree):**
- Straight-line outline with flat caps: bounding box and vertex count
- Curved S-stroke: bounds within 10% tolerance
- Round caps: extend past endpoint by ~half-width
- Tapered caps: narrower than flat at endpoints
- Variable width profiles: widen/narrow correctly

**Gaps in `outlineSplineStroke` — updated 2026-07-12:**

1. ~~**Miter/bevel join**~~ — resolved in sigrid `4d1298f`. No longer a gap.

2. ~~**Normal-override in outlining**~~ — resolved in sigrid `4d1298f`. No longer a gap.

**Optional donations (not gaps, just nice-to-have):**
- Adaptive sampling / flatness tolerance (reduces vertex count for straight sections)
- World-blend orientation (hybrid tangent/world nib direction)

---

## Notices (mother -> child)

### 2026-07-20 | Grid cell sizing fixed + view-gate Phase A shipped

**Grid cells** (`a995f6d`): cells now use `min-width`/`min-height` + 
`aspect-ratio` instead of fixed inline dimensions. The `1fr` grid tracks
stretch cells to fill the outliner width. Remove `!important` overrides.

**View-gate Phase A shipped** (`f83115d`). New props on `MOutlinerProps`:

```ts
interface MOutlinerProps {
  // Existing:
  viewMode?: "tree" | "grid";
  renderGridCell?: (node: cObject) => HTMLElement | null;
  gridCellSize?: number;

  // New — view-gate mode (replaces renderGridCell when set):
  gridViewGate?: (node: cObject) => MViewGate | null;
}

interface MViewGate {
  // World-space bounding rect this icon should show.
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
```

When `gridViewGate` is provided, the platform renders each cell as a live
scaled crop of the workbench viewport within that gate rect. The module only
declares bounds; rendering is platform-owned.

**Implementation approach (phased):**

1. **Phase A (immediate, 2D SVG modules):** Each grid cell gets a small
   `<svg>` with the same `viewBox` as the gate rect, rendered by the same
   path data the viewport uses. The workbench background, gridlines (1px),
   and fill colors are inherited from the viewport's CSS variables. This
   gives live updates for free — when the user changes background color,
   all icons update because they read the same CSS custom properties.

2. **Phase B (3D modules):** Each cell gets a small `<canvas>` rendered by
   the viewport's WebGL scene from a gate-aligned orthographic camera.
   Updates on tree change, not every frame (icons are static until the
   cObject changes).

3. **Phase C (floating-element mode as option):** The current isolated-shape
   rendering becomes an explicit `gridIconMode: "gate" | "floating"` toggle.
   Default is `"gate"`.

**What Moritz should do now:**
- Switch to `gridViewGate` + `gridViewGateRender` (Phase A is live)
- Remove the custom `renderGridCell` SVG triangulation code
- Each glyphsetter glyph gate: the glyph's em-square bounding box
- Each bubblesetter bubble gate: the bubble's visual bounding box

**Timeline:** Phase A shipped. Phase B (3D canvas crops) when 3D modules need it.

### 2026-07-16 | Module isolation guarantees resolved

See RESOLVED item above. Moritz can now:
- Remove the neutral `products` document assigned to Sigrid (Sigrid auto-creates its own).
- Remove any `activeWhen` guards that were working around the binding-priority bug.
- Trust that `cBinding.moduleId` ownership prevents foreign bindings from leaking into active-module slots.

### 2026-07-16 | Local project file system available

Plan 12 foundation shipped (`78e4041`). Every child app with `persistence`
descriptors on its `cDocumentSpec` entries can save/load `.christof.tree.json`
files to a local project folder. Ctrl+S saves dirty documents. Available
backends: Chromium directory picker, dev-server HTTP bridge (Vite plugin).

Moritz should add `persistence: { namespace: "moritz", kind: "tree" }` to
its persistent document specs when ready to use the new format.

### 2026-07-16 | MOutliner grid view mode available

Commit `2cafed7`. MOutliner now supports `viewMode: "grid"`. Use:

```ts
<MOutliner
  root={fontTree}
  viewMode="grid"
  renderGridCell={(glyph) => renderGlyphThumbnail(glyph)}
  gridCellSize={72}
  selectedId={selectedGlyphId}
  onSelect={onSelectGlyph}
/>
```

- Same component, same selection model, same skins — just grid layout.
- Moritz: replace `IconGrid` / `GlyphCObjectOutliner` with `MOutliner` in grid mode.
- shapeAndPose: replace thumbnail component similarly.
- `renderGridCell` provides the visual; magdalena handles selection, layout, click.

### 2026-07-14 | Undo/redo runtime delivered

Per-document undo/redo is available. Commits `31000f9`, `bae77e4`.
- `runtime.undo(documentId)` / `runtime.redo(documentId)`
- `runtime.beginHistoryGroup(documentId)` / `runtime.endHistoryGroup(documentId)`
- Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z keyboard routing
- Configurable history limit (default 100)
- Moritz should wrap slider/drag gestures in history groups

### 2026-07-12 | Sigrid glyph/spline target is available

The original platform blocker is resolved. Moritz can now target the public
`@christof/sigrid/glyph` API.

Available now:

- Canonical JSON-safe spline vertices with relative incoming/outgoing Bézier handles.
- Variable-width profiles and round, flat, tapered, and custom cap types.
- Semantic `sigrid.glyph`, `sigrid.stroke`, and `sigrid.splineVertex` cObjects.
- Constructors and readers for the semantic cObject hierarchy.
- Pure immutable operations for moving anchors and handles, smooth/broken tangent behavior, normal overrides, and width-profile samples.
- Initial cubic sampling, tangent, width interpolation, and deterministic stroke-outline functions.

Moritz's next steps:

1. Import the shared types from `@christof/sigrid/glyph` at the adapter boundary.
2. Emit `sigrid.glyph`, `sigrid.stroke`, and `sigrid.splineVertex` instead of generic groups with role metadata.
3. Run Moritz's existing outline fixtures against Sigrid and document every parity gap.
4. Donate adaptive flattening, miter/bevel joins, normal-override interpolation, caps, and edge-case fixtures into Sigrid where the initial implementation differs.
5. Keep Moritz's proven local outline implementation active until the shared implementation passes the complete parity suite.
6. After parity, remove duplicate local types/math and move on to Magdalena's shared spline editor integration.

Do not migrate font, page, bubble, or style policy into the curve nucleus yet.
Those document conventions remain a separate design step after geometry parity.

### 2026-07-10 | Channel established
Communication channel created. Write requests below the Requests heading.
Mother (Luise) will check this file periodically and respond in Notices or resolve to Log.

---

## Log

_No resolved items yet._
