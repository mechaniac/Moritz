# Moritz — platform-team-wishlist

Status: live
Last update: 2026-05-16
Audience: Luise / Sigrid / Magdalena directors
Authority: bound by [BECOME-A-CHILD.md](../../Luise/docs/BECOME-A-CHILD.md),
[platform-charter.md → Prime Directive](../../Luise/docs/platform-charter.md#prime-directive-binding-supersedes-all-other-clauses),
[CONTRIBUTING-AS-CONSUMER.md](../../Luise/docs/CONTRIBUTING-AS-CONSUMER.md),
[data-flow.md](../../Luise/docs/data-flow.md),
[module-contract.md](../../Luise/docs/module-contract.md).

Related Moritz docs:
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — Moritz product principles & domain model
- [CLAUDE.md](../CLAUDE.md) — mirror of the above for Claude Code

## Prime Directive acknowledgement

> The platform is sovereign. Moritz is a training case, not a customer.
> The default verdict on any wishlist entry is **rewrite the app, do not
> bend the platform**, even if the rewrite is total.

Every entry below is filed under the charter template. Entries that do
not name three apps that would use the proposed signature, or that do
not include an "app-side workaround if the platform refuses" paragraph,
are non-conformant and must be deleted on next pass.

The four allowed seams of a Moritz `src/` are documented in
[data-flow.md](../../Luise/docs/data-flow.md):

```
FILE  ↔  STATE  →  SCENE  →  PIXELS  ↔  INPUT
```

Anything between those seams is platform code. Moritz imports it. Moritz
does not vendor it. Moritz does not re-implement it.

## Charter compliance audit (2026-05-14)

Moritz is currently **non-compliant** in four categorical ways. Each is
listed with the binding rule it violates and the planned remediation
ordered by blast radius. None of these are wishlist entries — the
charter does not allow them to be. They are **app rewrites Moritz owes
the platform**.

### V1. Bespoke persistence envelopes (CONTRIBUTING-AS-CONSUMER → "must never do" #1)

Files: [src/state/persistence.ts](../src/state/persistence.ts),
[src/state/pagePersistence.ts](../src/state/pagePersistence.ts),
[src/state/bubblePersistence.ts](../src/state/bubblePersistence.ts),
[src/state/stylePersistence.ts](../src/state/stylePersistence.ts).

Use `{ format: 'moritz-<kind>', version: N, <payload> }` envelopes,
which the charter explicitly forbids ("Invent a persistence format.
`SigridProjectFile` is the only one.").

**Remediation:** rewrite all four files to round-trip through
`parseProjectFileJson` / `serializeProjectFileJson` (slice 121) and
validate via `validateSigridProjectFile` (slice 124). One-shot legacy
read at `loadX` boundary (sniff old shape, upgrade in-memory, save back
as `SigridProjectFile`). Save path is **always** `SigridProjectFile`,
never the legacy shape, never a dual-write. The recommended document
layout is filed below as wishlist entry W1 (kind names + node
conventions need a director ack before the rewrite can land).

### V2. App-local CSS palette (CONTRIBUTING-AS-CONSUMER → "must never do" #3)

Files: [src/styles.css](../src/styles.css), every `mz-mod--<id>`
class in the four module shells, the `mod={...}` prop on
`FloatingWindow`.

Charter: "Ship an app-local CSS palette. Use `--mg-*` tokens."

**Remediation:** delete every `--mz-*` token. Replace module-coloured
chrome with `--mg-*` tokens + `MgImportance` / `MgTone`. Module-tone
becomes a Magdalena `tone` prop, not a parallel CSS namespace. The
specific gap (importance/tone vocabulary that maps cleanly to the four
Moritz workspaces) is filed as wishlist entry W3 if and only if Moritz
cannot express what it needs with the existing tone vocabulary.

Progress 2026-05-16: the top-bar module switcher now uses Magdalena's
`MgModuleSwitcher`; it no longer applies `mz-mod--<id>` palette classes to
shell buttons. Module work areas still use `mz-mod--<id>` while their internal
inspectors migrate. The legacy Moritz colour-scheme picker (`themeStore` +
`SettingsModal`) has been deleted; Magdalena dev settings own shell theme/debug
controls.
Bundle: 795 KB → 792 KB. CSS asset: 55.30 KB → 50.42 KB after deleting
the unreachable alternate `data-theme` palettes, then 50.42 KB → 46.72 KB
after deleting dead legacy shell selectors.

### V3. Local interface library `src/sift/` (CONTRIBUTING-AS-CONSUMER → "must never do" #4) — resolved 2026-05-16

Deleted files: `src/sift/` — `SiftRoot`, `Workbench`,
`FloatingWindow`, `Tree`, `Attrs` / `AttrSection` / `AttrRow`, `inputs`
(`Button`, `Slider`, `TextInput`, `NumberInput`, `Checkbox`, `Select`),
`DevSettings`, `ImportanceDebugLayer`, `Imp`, `ClosenessGroup`,
`tokens`, `layout`, `sift.css`.

Charter: "Build a workbench, outliner, panel, control, gizmo, or dev
window from scratch. They live in `@christof/magdalena`."

**Remediation:** done 2026-05-16. `src/sift/` was deleted in full after every
live consumer moved to `@christof/magdalena/react` or to a small local native
control that preserves Moritz-font labels. There is no "Sift parity gap"
wishlist entry — the gap was Moritz's, not Magdalena's.

### V4. Rule-of-Three drift in `src/core/`

Files: [src/core/bubble.ts](../src/core/bubble.ts),
[src/core/bubbleFill.ts](../src/core/bubbleFill.ts),
[src/core/bubbleRender.ts](../src/core/bubbleRender.ts),
[src/core/effects.ts](../src/core/effects.ts),
[src/core/relax.ts](../src/core/relax.ts),
[src/core/widthEffects.ts](../src/core/widthEffects.ts),
[src/core/ribbon.ts](../src/core/ribbon.ts),
[src/core/glyphOps.ts](../src/core/glyphOps.ts),
[src/core/random.ts](../src/core/random.ts),
[src/core/page.ts](../src/core/page.ts), and the still-local pieces of
[src/core/stroke.ts](../src/core/stroke.ts),
[src/core/layout.ts](../src/core/layout.ts),
[src/core/bezier.ts](../src/core/bezier.ts).

Charter (Rule of Three): "any code in your `src/` that could plausibly
be useful in three different apps does not belong in your app." All of
the above are pure 2D vector math / layout helpers usable by any
present or future Christof drawing tool.

**Remediation:** for each, either (a) file a properly-templated
wishlist entry (W4–W6 below) with the donation candidate signature plus
the three apps that would use it, or (b) delete the helper from
Moritz's `src/` and adopt the existing upstream symbol — accepting
visible regressions if the upstream surface is narrower than what
Moritz used to render. Per the Prime Directive, **(b) is the default
verdict** unless the wishlist entry is accepted as proposed.

The 2026-05-14 diff that found upstream `@christof/sigrid-curves` to be
a "strict subset" of Moritz's local renderer is now correctly reframed:
the platform is the contract; if Moritz currently renders things the
platform cannot, Moritz stops rendering them. Properly-templated
wishlist entries (W4 below) are the only legitimate way to reverse
that.

---

## Wishlist entries

Each entry uses the template from
[CONTRIBUTING-AS-CONSUMER → How to file a wishlist entry](../../Luise/docs/CONTRIBUTING-AS-CONSUMER.md#how-to-file-a-wishlist-entry).
Entries missing the **Why this generalises** or **App-side workaround**
paragraphs are non-conformant and will be deleted.

### W1 — `SigridProjectFile` document `kind` names for app-namespaced facets

Where it would live: `@christof/sigrid` (registry / docs)
Replaces locally: enables remediation V1
Priority: P0 — blocks V1 rewrite.

Proposed function signature: no new function. A documented convention
in `@christof/sigrid` README that app-namespaced `SigridDocument.kind`
strings of the form `"<app>.<facet>"` are legitimate under the
`(string & {})` widening of `SigridDocument.kind`, and that the same
namespace prefix is allowed on `SigridNode.type`. Moritz proposes:

```jsonc
{
  "format": "sigrid.project",
  "version": 1,
  "createdBy": { "appId": "moritz", "appVersion": "0.1.0", "sigridVersion": "0.1.x" },
  "documents": {
    "fnt-base":   { "id": "fnt-base",   "kind": "moritz.font",        "version": 1, "rootId": "root", "nodes": { "root": { "id": "root", "name": "moritz-base", "type": "moritz.font.root", "parentId": null, "childIds": [], "extensions": { "moritz.font": { /* Font payload */ } } } } },
    "sty-italic": { "id": "sty-italic", "kind": "moritz.style",       "version": 1, "rootId": "root", "nodes": { "root": { "id": "root", "name": "italic",      "type": "moritz.style.root","parentId": null, "childIds": [], "extensions": { "moritz.style": { /* StyleSettings payload */ } } } } },
    "bub-clouds": { "id": "bub-clouds", "kind": "moritz.bubble-font", "version": 1, "rootId": "root", "nodes": { "root": { "id": "root", "name": "clouds",     "type": "moritz.bubble-font.root","parentId": null, "childIds": [], "extensions": { "moritz.bubble-font": { /* BubbleFont payload */ } } } } },
    "pg-page1":   { "id": "pg-page1",   "kind": "moritz.page",        "version": 1, "rootId": "root", "nodes": { "root": { "id": "root", "name": "page1",      "type": "moritz.page.root","parentId": null, "childIds": [], "extensions": { "moritz.page": { /* Page payload, library by doc-id ref */ } } } } }
  },
  "assets": {}
}
```

Why this generalises: every Christof app needs to write its own facets
into `SigridProjectFile` without colliding with another app's facets,
and without negotiating individual `kind` names with the Sigrid
director. SpaceSneaker would write `"spacesneaker.level"` /
`"spacesneaker.run"`; theGarden would write `"garden.plant"` /
`"garden.bed"`; Moritz writes `"moritz.font"` / `"moritz.style"` /
`"moritz.bubble-font"` / `"moritz.page"`. Without an app-namespacing
convention each app either (a) invents bespoke envelopes (currently
forbidden) or (b) waits indefinitely for central registration of every
facet name.

App-side workaround if the platform refuses: Moritz registers the four
specific names with the Sigrid director one at a time as native Sigrid
`kind` values; until accepted, `SigridProjectFile.documents` carries a
single document of `kind: "sigrid.opaque"` (a generic accepted kind)
with the entire Moritz state in `extensions["moritz.project"]`. The
file is still a `SigridProjectFile` and round-trips through
`parseProjectFileJson` / `serializeProjectFileJson`; it just loses
per-artefact granular validation.

### W2 — `MgViewport2d` shell (camera + pan/zoom + DPR-aware canvas)

Where it would live: `@christof/magdalena/2d` (mirroring the existing
`@christof/magdalena/3d` subpath that ships `Mg3dElement`).
Replaces locally: [src/ui/canvas/Workspace.tsx](../src/ui/canvas/Workspace.tsx),
[src/ui/canvas/coords.ts](../src/ui/canvas/coords.ts),
[src/ui/canvas/useCanvasInput.ts](../src/ui/canvas/useCanvasInput.ts),
[src/ui/canvas/useCanvasSize.ts](../src/ui/canvas/useCanvasSize.ts).
Priority: **P0** — blocks the four module shells from being thin
(currently each owns its own canvas plumbing in violation of the
"a very thin sliver of use-case-specific logic" target shape).

Proposed function signature:

```ts
// @christof/magdalena/2d
export interface MgViewport2dProps {
  // World-space viewport (pan + zoom in world units).
  view: { panX: number; panY: number; zoom: number };
  onViewChange?: (view: { panX: number; panY: number; zoom: number }) => void;
  // Optional pixel-aligned grid + guides config.
  guides?: MgViewport2dGuides;
  // Pixel-perfect HiDPI handling and resize observer baked in.
  children: ReactNode;     // SVG / Canvas overlay tree
}
export function MgViewport2d(props: MgViewport2dProps): JSX.Element;
export function useMgViewport2d(): MgViewport2dContext;  // panZoom, screen↔world mappers, hit-test
```

Why this generalises: every 2D Christof tool needs an infinite world
with smooth pan + zoom + retina-aware canvas. **Three apps**: Moritz
(comic lettering — four workspaces), Mex_Mapper (2D tile/region map
editor in the listed roster), Padoeng_Online (browser-based 2D play
field). `@christof/magdalena/3d` already ships the precedent for the
3D analogue; this is the 2D mirror.

App-side workaround if the platform refuses: Moritz keeps
`src/ui/canvas/*` indefinitely as a private quirk. The "thin sliver"
target shape becomes unreachable for Moritz's `src/`, so Moritz files
this as a permanent known violation and stops trying to delete it.

### W3 — `Mg2dElement` overlay primitives (lines, polygons, beziers, anchor handles)

Where it would live: `@christof/magdalena/2d`
Replaces locally: [src/editor/StrokeOverlay.tsx](../src/editor/StrokeOverlay.tsx),
[src/editor/BubbleLayerOverlayEditor.tsx](../src/editor/BubbleLayerOverlayEditor.tsx)
Priority: **P0** — blocks W2 (the viewport hosts overlays, so the
overlay element vocabulary must land first or together).

Proposed function signature: a 2D mirror of `Mg3dElement` with the
same `tone` / `importance` / `role` token system. Element kinds:
`'line' | 'polyline' | 'polygon' | 'cubic-bezier' | 'anchor' |
'in-handle' | 'out-handle' | 'control-ring' | 'drag-handle'`. Same
pure-data picker / merge / diff / lerp surface that `Mg3dGroup` got
in slices 87–90.

Why this generalises: any 2D Christof editor needs to render manipulable
geometry on top of the viewport. **Three apps**: Moritz (anchor + handle
editing for glyph splines and bubble layers), Mex_Mapper (region
boundary + waypoint editing), CeeTeeBuilder (2D constraint diagrams).
The `Mg3dElement` precedent already exists for 3D; without a 2D mirror
each 2D app writes its own SVG handle library.

App-side workaround if the platform refuses: Moritz keeps
`src/editor/*` indefinitely. Same consequence as W2 — the "thin
sliver" goal is permanently out of reach for Moritz's editor surface.

### W4 — `outlineGlyphStroke2d` extensions for Moritz-specific renderer richness

Where it would live: `@christof/sigrid-curves`
Replaces locally: enables full adoption of upstream
`outlineGlyphStroke2d` and deletion of [src/core/stroke.ts](../src/core/stroke.ts)
local extensions, [src/core/widthEffects.ts](../src/core/widthEffects.ts),
[src/core/effects.ts](../src/core/effects.ts) jitter,
[src/core/ribbon.ts](../src/core/ribbon.ts).
Priority: P2 — under the Prime Directive the **default action is to
delete the local features**, accept the upstream rendering, and ship
the regression. This entry exists only so the director has the option
to rule otherwise. If rejected, Moritz's renderer becomes whatever
`outlineGlyphStroke2d` produces with no Moritz-side post-processing.

Proposed function signature additions to
`GlyphStrokeOutlineOptions2d`:

```ts
flatness?: { chord: number; width: number; maxDepth: number };
widthMod?: (tArc: number, arcLen: number) => number;
capStart?: GlyphStrokeCap2d | { kind: 'custom'; path: GlyphStrokeVertex2d[] };
capEnd?:   GlyphStrokeCap2d | { kind: 'custom'; path: GlyphStrokeVertex2d[] };
worldAngleOffsetPerGlyph?: number;
jitter?: { amount: number; shape: 'axis-uniform' | 'polar-disc'; scope: 'instance' | 'glyph' | 'text'; seed: string };
```

And a new sibling:

```ts
// post-outline polygon shape jitter, preserves vertex count
export function jitterGlyphOutlinePolygon2d(
  polygon: ReadonlyArray<GlyphPoint2d>,
  options: { amount: number; shape: 'axis-uniform' | 'polar-disc'; seed: string },
): ReadonlyArray<GlyphPoint2d>;
```

Why this generalises: adaptive flattening, runtime width-modulation
callbacks, custom caps, and seed-scoped jitter are not Moritz-specific
— they are the standard primitives of any procedural vector renderer.
**Three apps**: Moritz (comic lettering), theGarden (procedural plant
trunks/branches need adaptive flattening + width-mod), CSim (cellular
simulation visualisations need seed-scoped jitter so the same cell
re-rolls per frame deterministically).

App-side workaround if the platform refuses: Moritz deletes
[src/core/stroke.ts](../src/core/stroke.ts) extensions,
[src/core/widthEffects.ts](../src/core/widthEffects.ts),
[src/core/effects.ts](../src/core/effects.ts),
[src/core/relax.ts](../src/core/relax.ts) and adopts upstream
`outlineGlyphStroke2d` as-is. Lettering loses: tight-bend smoothness at
high zoom, length-mode taper / cosine-noise wiggle, custom-shape caps,
deterministic seeded jitter, post-outline polygon jitter. Default
fonts are re-tuned to look acceptable under the upstream renderer.

### W5 — `chainOpenStrokesIntoLoops2d` for fillable hand-drawn outlines

Where it would live: `@christof/sigrid-curves`
Replaces locally: [src/core/bubbleFill.ts](../src/core/bubbleFill.ts)
`chainPolylinesToLoops` (enables adoption of
`triangulateGlyphFillMeshes2d` for cloud-bubble interiors).
Priority: P2 — same default verdict as W4: under the Prime Directive,
delete the feature unless the director rules otherwise.

Proposed function signature:

```ts
// @christof/sigrid-curves
export function chainOpenStrokesIntoLoops2d(
  strokes: ReadonlyArray<GlyphStroke2d>,
  options: { tolerance: number },
): ReadonlyArray<GlyphPolygon2d>;
```

Why this generalises: any free-hand 2D vector tool that wants to fill
the interior of a sketched outline (drawn as multiple disconnected
strokes whose endpoints approximately meet) needs this. **Three apps**:
Moritz (cloud-bubble fills), Mex_Mapper (sketch a region by a few open
strokes, fill the interior), CeeTeeBuilder (close hand-drawn diagrams
for shading).

App-side workaround if the platform refuses: Moritz deletes
[src/core/bubbleFill.ts](../src/core/bubbleFill.ts) and requires that
all bubble outlines are authored as single closed strokes. The default
bubble library is rebuilt to match. Cloud-style organic fills are
removed from Moritz's feature set.

### W6 — Bubble-layer primitives (multi-layer outline + per-layer fill + per-layer effects)

Where it would live: `@christof/sigrid-curves` (or new
`@christof/sigrid-paint` if the director prefers a separate package)
Replaces locally: [src/core/bubble.ts](../src/core/bubble.ts),
[src/core/bubbleRender.ts](../src/core/bubbleRender.ts)
Priority: P2 — donation candidate. Moritz already has working code;
this entry is here so the director picks the API shape before Moritz
files the actual `extraction:` issue.

Proposed function signature: TBD by director. Moritz's local API is in
[src/core/bubble.ts](../src/core/bubble.ts) and is the working draft.
Moritz expects to delete the file on adoption; the upstream signature
is at the director's discretion.

Why this generalises: multi-layer outlines with per-layer offset, fill,
and effects are a generic vector-paint primitive. **Three apps**:
Moritz (speech bubbles, captions), theGarden (layered leaf / petal
painting), CeeTeeBuilder (annotated diagram callouts with halo +
shadow).

App-side workaround if the platform refuses: Moritz keeps
`core/bubble*.ts` and files this as a permanent known violation of the
Rule of Three. The platform retains the right to absorb the code
without asking; Moritz will not resist.

### W7 — Workbench-shell migration (V3 remediation tracking)

Where it would live: `@christof/magdalena/react` (already ships
`MgWorkbench`, `MgFloatingWindow`, `mgDock`, `MgDevSettingsWindow`,
`MgModuleSwitcher`, `MgButton`, `MgSlider`, `MgTextInput`, `MgNumberInput`, `MgSelect`,
`MgToggle`, `MgAttrs`, `MgAttrSection`, `MgAttrRow`, `MgOutliner`,
`useMgElement`).
Replaces locally: deleted `src/sift/`.
Priority: **P0** — V3 violation tracking. This is not a request for
the platform to add features. It is the migration log for deleting
`src/sift/`. Sub-steps in deletion order:

1. ~~`MgWorkbench` + `MgViewportLayer` host the stage in [src/app.tsx](../src/app.tsx).~~ **Done 2026-05-14.**
2. ~~`MgDevSettingsWindow` auto-mounted by `MagdalenaProvider` in place of local `<DevSettingsWindow>`.~~ **Done 2026-05-14.**
3. ~~`MgFloatingWindow` replaces `FloatingWindow` in `app.tsx` and the four module shells.~~ **Done 2026-05-14 / superseded by the four-region shell on 2026-05-15.**
4. ~~`MgButton` / `MgSlider` / `MgTextInput` / `MgNumberInput` / `MgSelect` / `MgToggle` replace Sift inputs.~~ **Done 2026-05-16 for all live Sift consumers.** Top-bar module navigation now uses `MgModuleSwitcher`; the top-bar zoom slider is a local native range input with a Moritz glyph label.
5. ~~`MgOutliner` replaces Sift `Tree` in module shells.~~ **Done 2026-05-15.**
6. ~~`MgAttrs` / `MgAttrSection` / `MgAttrRow` replace Sift equivalents in module shells.~~ **Done 2026-05-16 by deletion; no live Sift attrs consumer remained.**
7. ~~`MagdalenaProvider` context (`useMagdalena`, `useMgElement`) replaces `SiftRoot` context (`useSift`, `useSiftLayout`, `useImportance`, `Imp`, `ClosenessGroup`). `src/sift/` is deleted.~~ **Done 2026-05-16.**

Why this generalises: not a generalisation entry. This is the V3
remediation log. Listed under wishlist for visibility only.

App-side workaround if the platform refuses: not applicable. The
charter forbids `src/sift/` regardless of Magdalena's surface area.

---

## Adoption Queue (shipped upstream, pending swap)

Each row is one PR: swap the upstream symbol in, delete the local file,
port the test (or delete it if `@christof/sigrid-curves` already has
equivalent coverage). Strikethrough = adopted (see *Recently Adopted*).

| # | Upstream symbol (slice) | Local file to delete |
|---|---|---|
| 1 | ~~`triangulateSimplePolygon2d` (slice 104)~~ | ~~[src/core/triangulate.ts](../src/core/triangulate.ts)~~ — adopted as shim |
| 2 | ~~`glyphSpline2d` cubic + tangent + segment helpers (slice 92)~~ | ~~[src/core/bezier.ts](../src/core/bezier.ts)~~ — partial, `bezier-js` still used for arc length + projection (see W4 default verdict: delete the local part, lose those two helpers) |
| 3 | ~~`transformGlyph2d` / `affineFromGlyphStyle2d` (slice 93)~~ | ~~[src/core/transform.ts](../src/core/transform.ts)~~ — adopted as shim |
| 4 | `outlineGlyphStroke2d` + width direction controls (slices 94, 95) | most of [src/core/stroke.ts](../src/core/stroke.ts) — **adopt as-is**, delete local extensions per V4 default verdict; W4 is the only legitimate way to keep the local features |
| 5 | `triangulateGlyphFillMeshes2d` (slices 106, 107) + `glyphMeshBatch2d` (slice 110) | [src/core/bubbleFill.ts](../src/core/bubbleFill.ts) — **adopt as-is**, delete `chainPolylinesToLoops`; W5 is the only legitimate way to keep open-stroke chaining |
| 6 | `triangulateGlyphStrokeRibbon2d` (slices 96, 98) | [src/core/ribbon.ts](../src/core/ribbon.ts) — adopt as-is |
| 7 | `glyphWidthEffects2d` (slice 99) | [src/core/widthEffects.ts](../src/core/widthEffects.ts) — **adopt as-is**, delete the local runtime-callback model; W4 is the only legitimate way to keep it |
| 8 | `jitterGlyphStroke2d` / `relaxGlyphStroke2d` (slice 100) | [src/core/effects.ts](../src/core/effects.ts), [src/core/relax.ts](../src/core/relax.ts) — **adopt as-is**, delete local jitter-shape / scope variants; W4 is the only legitimate way to keep them |
| 9 | `layoutGlyphs2d` + wrap + paragraph + line metadata (slices 93, 101, 102, 103) | [src/core/layout.ts](../src/core/layout.ts) — adopt as-is once #4/#7 above land |
| 10 | `parseProjectFileJson` / `serializeProjectFileJson` (slice 121) + `validateSigridProjectFile` (slice 124) | V1 remediation. Pending W1 ack on document `kind` names. Read legacy once at boundary, save as `SigridProjectFile` forever. |
| 11 | `MgWorkbench`, `MgFloatingWindow`, `mgDock`, `MgDevSettingsWindow`, `MgModuleSwitcher`, Mg controls, `MgAttrs`, `MgOutliner`, `useMgElement` | V3 remediation. Tracked sub-step-by-sub-step in W7 above. |
| 12 | (V2 remediation — `--mg-*` token migration) | [src/styles.css](../src/styles.css) and every `mz-mod--<id>` class. No upstream symbol to wait on; pure deletion + token swap. |

---

## Recently Adopted

Local code Moritz has actually deleted in favour of an upstream symbol.

| Date | Upstream symbol | What we deleted locally |
|---|---|---|
| 2026-05-16 | `MgModuleSwitcher` from `@christof/magdalena/react` | Replaced the hand-wired top-bar module button map in [src/app.tsx](../src/app.tsx). Module labels still render through `MoritzLabel`, but Magdalena now owns the module-switcher role, active-state metadata, tone, and selected importance. 151/151 tests green. Bundle: 792 KB. |
| 2026-05-16 | `MagdalenaProvider`, `MgDevSettingsWindow`, `MgWorkbench`, `MgTopBar`, `MgLeftBar`, `MgRightBar`, `MgCOptions`, `MgButton`, `MgOutliner` from `@christof/magdalena/react` | Deleted `src/sift/` in full: local `SiftRoot`, workbench, floating window, attrs, tree, inputs, dev settings, importance overlay, layout, tokens, and CSS. The app shell now relies on Magdalena for root/debug settings and shell regions; the remaining zoom slider is a tiny native range input with a Moritz glyph label. 151/151 tests green. Bundle: 800 KB → 795 KB. |
| 2026-05-15 | `cObject`, `cMarkSelection`, `cPrimarySelectedObject`, `cSelectedObjects` from `@christof/sigrid-geometry`; `animateGlyphSymbolsAlongStroke2d` from `@christof/sigrid-curves`; `MgOutliner` from `@christof/magdalena/react` | Added the Moritz cObject adapter in [src/core/moritzCObjects.ts](../src/core/moritzCObjects.ts): `font -> glyph -> animator? -> stroke -> anchor -> handles`, plus `bubbleFont -> bubble -> layer -> glyph -> strokes` and `page -> block -> text/bubble -> layer -> glyph -> strokes`. `Glyph` is now explicitly the nuclear drawable unit and can carry a pure-data `GlyphAnimatorComponent`, bridged by [src/core/glyphAnimator.ts](../src/core/glyphAnimator.ts). GlyphSetter, BubbleSetter, and TypeSetter left bars now show cObject trees; TypeSetter's cObject tree now consumes canonical `Block` / `TextRun` data at the shell boundary. `MgCOptions` follows selected glyph cObjects. Plan recorded in [docs/moritz-cobject-plan.md](moritz-cobject-plan.md). 150/150 tests green. Bundle: 801 KB. |
| 2026-05-15 | `MgTopBar` / `MgLeftBar` / `MgRightBar` / `MgCOptions` from `@christof/magdalena/react` (the new mandatory four-region shell from [BECOME-A-CHILD.md → Mandatory shell](../../Luise/docs/BECOME-A-CHILD.md#mandatory-shell-the-four-regions)) | Every `MgFloatingWindow dock={mgDock.toolbar/outliner/attributes/instance}` call site (1 toolbar in [src/app.tsx](../src/app.tsx), 3 windows in [src/modules/glyphsetter/GlyphSetter.tsx](../src/modules/glyphsetter/GlyphSetter.tsx), 2 windows × 3 in stylesetter / bubblesetter / typesetter). Region semantics now declared at the call site instead of via dock-preset selection. The selection-driven `MgCOptions` replaces the GlyphSetter `itemattrs` window and now only mounts while a glyph cObject is selected. 135/135 tests green. Bundle: 768 KB → 768 KB. |
| 2026-05-14 | `MgFloatingWindow` + `mgDock.{toolbar,outliner,attributes,instance}` from `@christof/magdalena/react` | Every Sift `<FloatingWindow>` call site (1 in [src/app.tsx](../src/app.tsx), 3 in [src/modules/glyphsetter/GlyphSetter.tsx](../src/modules/glyphsetter/GlyphSetter.tsx), 2 in [src/modules/stylesetter/StyleSetter.tsx](../src/modules/stylesetter/StyleSetter.tsx), 2 in [src/modules/bubblesetter/BubbleSetter.tsx](../src/modules/bubblesetter/BubbleSetter.tsx), 2 in [src/modules/typesetter/TypeSetter.tsx](../src/modules/typesetter/TypeSetter.tsx)). The `mod={...}` palette-inheritance prop and the `initial={x,y,w,h}` undocked-bounds prop are **deleted, not replaced** (V2 / V7 sub-step 3 deliberate feature loss). The bare-window `bare` prop becomes "no `title`" + `dock={mgDock.instance}` per Mg's auto-detection. `useSiftLayout()` + the `dockToolbar/dockOutliner/dockAttrs/dockItemAttrs` helpers are no longer called; their imports stripped from each shell. Local `src/sift/FloatingWindow.tsx` + `src/sift/layout.ts` are now dead code reachable only via `src/sift/index.ts` re-exports. Bundle: 772 KB → 768 KB. 135/135 tests green. Sub-step 3 of W7. |
| 2026-05-14 | `MgWorkbench` + `MgViewportLayer` from `@christof/magdalena/react` | Sift `<Workbench stage windows overlays>` wrapper component in [src/app.tsx](../src/app.tsx); the stage / windows / overlays are now plain children of `MgWorkbench`. Local `src/sift/Workbench.tsx` is now dead code reachable only via `src/sift/index.ts` re-exports. Bundle: 772 KB → 772 KB (Sift `Workbench` was 12 LOC of pure JSX). 135/135 tests green. Sub-step 1 of W7. |
| 2026-05-14 | `MgDevSettingsWindow` auto-mounted by `MagdalenaProvider` (default `devSettings: true`) | Local `<DevSettingsWindow />` toggle in [src/app.tsx](../src/app.tsx). Local `src/sift/DevSettings.tsx` is now dead code reachable only via `src/sift/index.ts` re-exports. Bundle: 778 KB → 772 KB. 135/135 tests green. Sub-step 2 of W7. |
| 2026-05-14 | `triangulateSimplePolygon2d` from `@christof/sigrid-curves` (slice 104) | `earcut` + `@types/earcut` dependencies; body of [src/core/triangulate.ts](../src/core/triangulate.ts) is now a thin delegating shim. Bundle: 781 KB → 778 KB. 135/135 tests green. |
| 2026-05-14 | `evalGlyphCubicSegment`, `unitTangentGlyphCubicSegment`, `glyphVertexPairToSegment`, `glyphStrokeToSegments` from `@christof/sigrid-curves` (slice 92) | Hand-rolled cubic + derivative + segment-builder math in [src/core/bezier.ts](../src/core/bezier.ts) (~50 lines). Local `CubicSegment` is now a type alias of upstream `GlyphCubicSegment2d`. `bezier-js`-backed `segmentLength` / `closestPointT` / `sampleStroke` stay local until upstream ships arc-length + projection (or until the W4 default verdict triggers their deletion). 135/135 tests green. |
| 2026-05-14 | `affineFromGlyphStyle2d`, `transformGlyph2d`, `transformGlyphStroke2d`, `transformGlyphVertex2d` from `@christof/sigrid-curves` (slice 93) | Hand-rolled affine + slant-pivot math in [src/core/transform.ts](../src/core/transform.ts) (~80 lines). Local `Affine` is now a type alias of upstream `Affine2d`. 135/135 tests green. |

## Recently Shipped Upstream (pending Moritz adoption)

| Date | Upstream symbol | Closes our ask |
|---|---|---|
| 2026-05-14 (slice 131) | `MgAttrs`, `MgAttrSection`, `MgAttrRow`, `MgNumberInput`, `MgSelect`, `MgTabs`, `MgList`, `MgMetrics` (v0.1.x stable contract) | W7 sub-steps 4 + 6 |
| 2026-05-14 (slice 129) | `MgDevSettingsWindow` `extraSections` + `MagdalenaDevSettingsConfig.extraSections` | W7 sub-step 2 (already adopted) |
| 2026-05-14 (slice 126) | `prepare: npm run build` on every `@christof/*` package | None; see Bug Reports below |
| 2026-05-14 (slice 124) | `validateSigridDocument` / `validateSigridProjectFile` | V1 (paired with W1) |
| 2026-05-14 (slice 121) | `parseProjectFileJson` / `serializeProjectFileJson` | V1 (paired with W1) |
| 2026-05-14 (slices 92–110) | `@christof/sigrid-curves` Moritz-style 2D pipeline | Adoption Queue rows #1–#9 |

## Bug Reports

Not wishlist entries — these are platform regressions Moritz has hit.

### B1 — slice 126 `prepare: npm run build` breaks `file:` consumers

Repro: in Moritz, `npm install` triggers `prepare` inside
`@christof/sigrid-curves`, which `tsc`-builds and fails because its
workspace dep `@christof/sigrid` (`workspace:*`) is not resolvable
from outside Luise's monorepo. Workaround: `npm install
--ignore-scripts`. Affects every `file:` consumer, not Moritz alone.
Filed for Luise director attention; Moritz has no app-side fix
beyond the workaround.
