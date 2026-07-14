# Channel: Moritz
<!-- STATUS: INTEGRATION IN PROGRESS -->

## Requests (child -> mother)

### 2026-07-14 | Module isolation guarantees — CRITICAL

Sigrid behaves incorrectly when switched to in the Moritz workspace. It shows
a 2D graph of Moritz font data instead of its native 3D scene. Root causes:

- Moritz was registering viewport/leftbar bindings that activated when sigrid
  was the active module (fixed on Moritz side — removed from binding set)
- Sigrid had no native document in the workspace (fixed — now points to a
  neutral `products` tree instead of `moritz.font`)

**Remaining platform request:**

The architecture should make this class of bug structurally impossible:

1. **Binding priority** — a module's own bindings should always win over
   third-party bindings for the same slot when that module is active.
2. **Default documents** — if a workspace doesn't provide a document for a
   platform module, the runtime should create one from the module's defaults.
3. **Validation** — `initial.documentByModule[moduleId]` should be validated
   (or typed) so a child app can't accidentally assign incompatible documents
   to platform modules.

### 2026-07-14 | Leftbar layout contract

When a leftbar binding returns a single scrollable container with
`flex: 1 1 0; min-height: 0; overflow-y: auto`, it renders at zero height.
Splitting into multiple flex children with `overflow: auto` works.

The `.m-workbench-bar__body` is `display: flex; flex-direction: column;
flex: 1 1 auto; overflow: hidden`. A single flex child with `flex: 1 1 0`
should fill it, but doesn't reliably.

**Request:** Document the sizing contract for binding content, or investigate
why a single `flex: 1 1 0` child inside the bar body collapses to zero height.
Moritz works around this with two flex children sharing space.

### 2026-07-14 | Floating attributes position persistence

The floating attributes panel resets its dragged position on every tree change.
Moritz tree memoization mostly fixes this, but any real data change (selection,
slider) still causes a jump.

**Request:** Store the floating panel's position on the chrome tree (or a
persistent state outside component-local React state) so it survives re-renders.

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
