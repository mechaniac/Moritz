# Moritz cObject Plan

Status: active
Date: 2026-05-15

Related: [Glyph System Donation Map](glyph-system-donation-map.md)

## Naming Decision

The nuclear element of a Moritz font is a `Glyph`.

A `Font` is the collection container: metrics, style defaults, kerning, guides,
and a `glyphs` record. It is not the smallest drawable unit. A `Glyph` is the
smallest universal drawable unit that can be edited, arranged, rendered, and
animated outside the GlyphSetter.

## cObject Shape

Moritz exposes fonts to Sigrid as a cObject tree:

```txt
font
  glyph
    animator?
    stroke
      anchor
        in handle
        out handle
```

Current upstream `CKind` only supports `group` and `extrude`, so Moritz uses
`kind: "group"` for semantic nodes and keeps Moritz-specific role metadata in
the adapter layer. When Sigrid grows typed glyph cKinds, this adapter is the
single place to change.

## Animator Rule

Animation belongs to the glyph, not to the font container.

`Glyph.animator` is a pure-data component. UI code can render it live, but the
runtime bridge is `animateGlyphWithAnimator()`, not a React component. This
keeps glyph animation usable by labels, menus, page layout, export, and future
non-React renderers.

## Workspace Rule

Sigrid/Magdalena owns the shell:

- `topBar`: app/module/project controls.
- `leftBar`: font contents, glyph list, cObject outliner.
- `rightBar`: class-wide settings for the selected kind.
- `cOptions`: per-instance settings for the selected cObject.

Moritz should only provide the domain payloads and handlers that populate those
regions.

## Current Slice

- GlyphSetter exposes the selected glyph as a cObject tree in `leftBar`.
- `cOptions` follows glyph, animator, stroke, anchor, and multi-stroke
  selection.
- The top-bar module menu labels render through the active Moritz font via
  `MoritzText`.
- The shell save/load/import/export command buttons, GlyphSetter-owned tabs,
  glyph action menu labels, style controls, guide controls, bubble controls,
  TypeSetter inspector controls, and the settings modal render through
  `MoritzLabel`.
- The top-bar module switcher now uses Magdalena `MgModuleSwitcher` while
  keeping Moritz-font label nodes.
- The top-bar zoom slider is a local native range input with a Moritz glyph
  label, so the shell no longer imports Sift controls.
- The old `src/sift` interface library has been deleted; Magdalena now owns the
  workbench root, debug settings, shell regions, buttons, and outliner surface.
- The GlyphSetter left-column tab strip keeps Moritz-font labels, but now
  registers through `useMgElement` and uses Magdalena tokens for its chrome.
- Repo-owned menus in `src/modules` and `src/ui` now render their trigger and
  menu item captions through `MoritzSelect`, which uses `MoritzLabel` rather
  than native `<select>/<option>` text. Its chrome now uses Magdalena tokens;
  it remains a temporary app-side bridge until Magdalena can render selectable
  labels as cObjects.
- BubbleFont and live TypeSetter pages now have cObject adapters too:
  `bubbleFont -> bubble -> layer -> glyph -> strokes` and
  `page -> block -> text/bubble -> layer -> glyph -> strokes`. BubbleSetter
  and TypeSetter mount those trees through `MgOutliner`, so page blocks and
  bubble layers now share the same cObject identity path as font glyphs.
- The TypeSetter cObject adapter now consumes canonical `Block` / `TextRun`
  data. The workspace still stores legacy `TextBlock` data for editing, but the
  conversion happens at the TypeSetter shell boundary instead of inside the
  cObject adapter.

## Next Slices

1. Add renderer equivalence fixtures for the glyph-system donation candidates
   in [glyph-system-donation-map.md](archive/glyph-system-donation-map.md).
2. Promote TypeSetter's live legacy `TextBlock` state to the canonical
   `Page -> Block -> TextRun` runtime model so the cObject tree no longer needs
   a compatibility adapter.
3. Replace remaining hand-rolled left/right panel controls with Magdalena mObject
   or Mg controls.
4. Move persistence to `SigridProjectFile`, storing font/glyph cObject identity
   rather than app-local envelopes.
5. Replace shell call sites with an mObject tree once the current direct React
   shell is stable.

## Platform Donation Direction (2026-07-23)

### Glyph primitives → `@christof/sigrid/glyph`

The sigrid glyph target is available since 2026-07-12 (channel). Moritz should:
- Import shared `Vertex`, `Stroke`, `WidthProfile`, `CapShape` from sigrid
- Run outline parity suite against sigrid's implementation
- Once parity confirmed, drop local duplicates in `src/core/types.ts`
- Donate adaptive flattening, miter/bevel joins, caps, and edge-case fixtures
- The glyph → cObject tree shape (`font → glyph → stroke → anchor`) becomes
  a sigrid-provided constructor, not a Moritz adapter

### Bubble primitives → `@christof/sigrid/bubble` (new)

Multi-layer spline model (`BubbleLayer`, offset/fill/effects) should move to
a new sigrid package. This enables any comic/illustration child project to
create and render speech bubbles without depending on Moritz.

What moves: `BubbleLayer`, `Bubble`, `BubbleFont` types; `bubbleFill.ts`
(loop/fill geometry); `bubbleRender.ts` (SVG render); bubble → cObject adapter.

What stays: BubbleSetter UI, bubble persistence, bubble font management.

### Grid outliner view-gate → platform convention

The view-gate pattern (`gridViewGate` + `gridViewGateRender`) is already a
platform feature. The remaining gap: **navigate-on-click** behavior should be
platform-default for grid mode. Currently Moritz manually extracts the element
ID from the clicked cell's cId and dispatches a selection change.

### Debug overlays → gateway with `visibility: 'debug'`

Moritz's debug overlays (borders, triangles, spline0, spline1) become gateway
functions that only appear when the workbench debug toggle is active. This
requires the platform to support `visibility: 'debug'` on `PublicFn` (or at
minimum, expose `debugEnabled` in the binding context).

### What stays in Moritz permanently

- **Font** as a collection (glyphs + style + kerning + guides)
- **Page composition** (Block, TextRun, page library)
- **StyleSettings** (typeface-level modulation)
- **TypeSetter** (page layout workspace)
- **Persistence** (save/load/import/export)
- **Font/style/bubble font management UI**
