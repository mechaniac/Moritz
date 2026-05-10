# Moritz

Moritz is a **font, bubble, style, and page generator for comic-book
lettering**. It is a browser-based WYSIWYG editor where the user can design
stroke-based glyphs, speech-bubble libraries, rendering styles, and final comic
pages, then export the result as SVG or transparent PNG.

The product goal is a funnel:

```text
Glyphs + Bubbles + Styles + Images
             |
             v
          Pages
             |
             v
       Render / Export
```

Moritz is opinionated, not blank-slate. New fonts, bubbles, and pages start
from useful built-in defaults. The user edits, swaps, adds, and combines parts
instead of starting from zero. A page is intended to become a self-contained
package: the page layout, background image, referenced fonts, styles, bubble
libraries, and per-element overrides should all travel together.

---

## Quick Start

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The Vite dev server defaults to:

```text
http://localhost:5173
```

Tested with Node 20+.

---

## Current Product Shape

Moritz currently has four main workspaces:

1. **GlyphSetter**
   Edits individual glyphs as variable-width cubic-Bezier strokes. It supports
   anchor editing, handles, fill preview, triangulation/debug overlays,
   reference font tracing, metrics import, kerning, and per-font guide settings.

2. **BubbleSetter**
   Edits bubble presets. A bubble is a multi-layer composition where each layer
   uses glyph-like stroke geometry, plus layer placement, scale, rotation, fill,
   visibility, and role metadata.

3. **StyleSetter**
   Edits the active rendering style: slant, scale, stroke width, cap behavior,
   ribbon triangulation, world/tangent normal blending, spacing, and procedural
   effects such as jitter, wiggle, and taper.

4. **TypeSetter**
   Composes final pages. The page contains blocks; blocks contain bubble and
   text data. TypeSetter loads a background image, places text/bubble blocks,
   supports per-block font/style selection, allows in-place bubble editing, and
   exports the final overlay.

The intended architecture is that these are not separate apps. They are lenses
over the same kind of editor: a fullscreen vector workspace with floating
elements, shared camera behavior, shared selection rules, shared handles, and
shared inspector/outliner concepts. When behavior can be shared, it should be
shared.

---

## User Workflow

The intended user workflow is:

1. Start from a built-in font, bubble library, style, and page preset.
2. Adjust glyphs in GlyphSetter.
3. Adjust bubble presets in BubbleSetter.
4. Tune the visual style in StyleSetter.
5. Compose blocks on a page in TypeSetter.
6. Assign fonts/styles per text element and styles per bubble.
7. Edit bubbles directly on the page when needed.
8. Save/export the page as a portable package and render SVG/PNG output.

Exports are vector-first. SVG is the canonical output; PNG is a rasterization
of that SVG.

---

## Core Architecture

The code follows a functional-core / imperative-shell split.

```text
src/
  core/          pure geometry, layout, rendering, data types
  data/          built-in fonts, styles, bubbles, presets
  state/         Zustand stores and persistence wrappers
  modules/       workspace-specific React shells
  editor/        shared editor overlays and interaction pieces
  ui/            older shared UI utilities
  sift/          extractable interface system
  app.tsx        app shell and workspace routing
```

Everything in `src/core/` should be pure: no DOM, no React, no browser storage,
no randomness without an explicit seed, and no hidden side effects.

The current rendering pipeline is:

```text
Font + StyleSettings + text
      |
      v
layout(text, font, style)
      |
      v
transform(glyph, style)
      |
      v
outline / ribbon triangulation
      |
      v
render to SVG / canvas / PNG
```

The critical rule is that style transforms are applied to the glyph control
points before re-outlining. Moritz does not warp the already-rendered shape for
slant or scale changes; it re-evaluates the geometry so stroke thickness and
curvature stay natural.

---

## Domain Model

The canonical data types live in [src/core/types.ts](src/core/types.ts).
Everything is plain immutable JSON-serializable data.

Important domain concepts:

- **Font**
  A named set of glyphs plus default style data and optional kerning/guides.

- **Glyph**
  A character with an editing box and a list of strokes.

- **Stroke**
  A cubic-Bezier path with vertices, handles, optional width profile, caps, and
  normal overrides.

- **Style**
  A named rendering settings object. Styles are intended to be reusable across
  fonts, bubbles, and page elements.

- **BubbleFont**
  A named library of bubble presets.

- **Bubble**
  A multi-layer drawing. Each layer contains glyph-like vector geometry and
  placement/rendering metadata.

- **Page**
  A self-contained scene: dimensions, optional background image, blocks, and a
  local library snapshot of referenced fonts, styles, and bubble fonts.

- **Block**
  A positioned frame on a page. It may contain a bubble and one or more text
  runs.

- **TextRun**
  Text plus font/style references and local modulations such as size, bold
  factor, slant delta, and alignment.

The target hierarchy is:

```text
Page
  blocks[]
    bubble?
      styleId
      preset reference or per-instance override
    texts[]
      text
      fontId
      styleId
      local text settings
  library
    fonts
    styles
    bubbleFonts
```

Some runtime code still uses legacy flat `TextBlock` data for TypeSetter and
converts to/from the canonical page shape during persistence. That migration is
in progress.

---

## Interface Module: Sift

Moritz has an extractable interface module in [src/sift](src/sift). This is the
home for the app's opinionated UI system. It is intended to become reusable in
other projects, so generic interface behavior belongs in `src/sift/`, while
Moritz-specific composition belongs in `src/app.tsx`, `src/modules/`, or
Moritz-specific wrappers.

### Sift Principles

Sift is based on a small set of strict visual and interaction principles:

- The interface is almost monochromatic.
- The main theme axis moves from cold/dark night to warm/bright day.
- Pure black and pure white are avoided except at deliberate extremes.
- Local contrast should be low: nearby visible parts should have nearby colors.
- Color is reserved for meaning:
  - green: generate/start
  - yellow: annotation/help
  - orange: currently important/relevant
  - red: changed/save/overwrite/destructive
- Changed controls should change themselves; avoid unrelated warning outlines.
- The app is fullscreen.
- Interface elements live as floating/dockable windows.
- Main windows have sensible locked positions but can be unpinned.
- Importance is a first-class UI property: important things become bigger,
  brighter, heavier, or higher contrast.
- Debug mode should expose importance and eventually relationship overlays.
- No Tailwind or generic UI kit. Sift is the UI kit.

### Sift Files

```text
src/sift/
  index.ts             public exports and module summary
  SiftRoot.tsx         context, token injection, debug state, importance state
  tokens.ts            day/night theme and semantic token generation
  layout.ts            dock positions for toolbar/outliner/attrs windows
  Workbench.tsx        fullscreen app shell
  FloatingWindow.tsx   docked/free floating panels
  Tree.tsx             generic collapsible outliner
  Attrs.tsx            generic right-side inspector layout
  inputs.tsx           Sift buttons, inputs, sliders, checkboxes, selects
  DevSettings.tsx      live theme/layout/debug/importance tooling
  sift.css             base stylesheet for all Sift primitives
```

### Current Sift State

Implemented today:

- `SiftRoot` wraps the app and injects generated CSS tokens.
- `Workbench` provides the fullscreen stage/window/overlay structure.
- `FloatingWindow` supports docked windows, dragged floating windows, and pinning
  back to docked positions.
- `layout.ts` defines shared dock positions for:
  - top toolbar
  - left outliner
  - right attributes inspector
  - item attributes
- `tokens.ts` generates:
  - cold/dark to warm/bright theme colors
  - low-contrast surface ramps
  - semantic accents
  - importance scales
  - spacing/radius/animation tokens
- `DevSettingsWindow` exposes live theme and layout sliders.
- `ImportanceDebugLayer` allows right-click importance editing in debug mode for
  wrapped Sift targets.
- `Tree` provides a generic collapsible outliner.
- `Attrs`, `AttrSection`, and `AttrRow` provide a generic attributes inspector.
- Sift controls exist for buttons, text inputs, number inputs, sliders,
  checkboxes, and selects.
- The main app shell now uses Sift for the global workbench, toolbar, dev
  settings, and importance overlay.
- GlyphSetter, BubbleSetter, and StyleSetter now expose Sift outliner and
  attributes windows from their workspace shells.
- TypeSetter already uses Sift floating windows for page/outliner and style
  attributes.

### Current Gaps

Sift is real, but it is not yet fully applied everywhere.

Remaining gaps:

- Many module internals still use legacy `mz-*` styles and inline styles.
- The old theme picker still exists beside Sift's day/night token system.
- Native/legacy controls still appear in module panels.
- Sift outliners are currently structural summaries; they are not yet the full
  source of truth for all selection and scene hierarchy behavior.
- TypeSetter still uses some legacy block data internally.
- Debug mode does not yet "show all controls" globally.
- Importance is per wrapped element, but class-level/global importance behavior
  is not yet configurable.
- Closeness is represented by tokens and CSS conventions, but not yet measured or
  audited across every visible sub-element.
- Selected-node child overlays and spline connection overlays are planned but not
  implemented as a shared Sift/Moritz shell feature.
- Sift is designed to be extractable, but there is still coupling to Moritz
  palette variables in some CSS while migration is ongoing.

### Sift Plan

The interface migration plan is:

1. Make Sift the single shell for all workspaces.
2. Move all top-level panels to Sift `FloatingWindow`s.
3. Replace legacy drawers with docked Sift windows.
4. Render every workspace hierarchy through Sift `Tree`.
5. Render every primary inspector through Sift `Attrs`.
6. Replace legacy/native inputs with Sift controls.
7. Bridge or retire the old theme store.
8. Move module-specific inline styles into named `mz-*` composition classes or
   generic `sf-*` Sift classes.
9. Add class-level importance configuration.
10. Expand debug mode so the developer can reveal hidden controls, inspect
    importance, inspect closeness, and view relationship overlays.
11. Add selected-node child overlays and connection splines as shared shell
    features.
12. Extract Sift cleanly enough that it can be copied into another project with
    minimal Moritz-specific code.

---

## Workspace Architecture Plan

The long-term editor architecture is one base editor presented through several
workspace lenses.

Shared editor capabilities should include:

- infinite vector workspace
- pan/zoom camera
- stable grid system
- selection
- marquee selection
- anchor and handle editing
- shared stroke overlay rendering
- outliner selection
- attributes inspector
- debug overlays
- snapping/guides
- import/export hooks

Workspace-specific behavior should mainly be configuration:

- which objects are shown
- which grid is active
- which tools are enabled
- which inspector sections appear
- which save/load target is active
- which export action is primary

The goal is that a change to anchor editing, stroke display, selection, or
importance/debug behavior is made once and appears everywhere.

---

## Persistence

Moritz persists data in two ways:

- Browser storage for normal app usage.
- Dev-only repo writes for some save flows during local development.

The persistence direction is:

- fonts save as complete font packages
- styles save as complete reusable style packages
- bubble fonts save as complete bubble libraries
- pages save as self-contained packages

A final page package should include:

- page dimensions
- block layout
- page background image as data URL
- referenced fonts
- referenced styles
- referenced bubble fonts
- per-block/per-run assignments
- per-instance overrides

---

## Rendering and Geometry Notes

Moritz supports both filled polygon rendering and ribbon-style triangulation.

Key geometry concepts:

- cubic-Bezier sampling
- tangent-based normals
- world-angle normals
- blend between tangent and world normals
- world contraction
- miter/bevel/round/tapered caps
- per-anchor normal overrides
- width profiles
- deterministic effects
- ribbon subdivision
- arc-length-aware subdivision
- seeded procedural variation

The renderer should stay deterministic: the same data and seed should produce
the same SVG.

---

## Testing and Verification

Useful commands:

```bash
npm run typecheck
npm test
npm run build
```

Guidelines:

- Changes in `src/core/` should have tests.
- UI shell changes should at least pass typecheck and build.
- Shared behavior should be tested at the lowest pure layer possible.
- Avoid testing visual details through brittle snapshots unless the visual
  contract is the feature being protected.

---

## Coding Rules

Short version:

- Keep `src/core/` pure.
- Use immutable JSON data.
- Prefer shared editor/Sift abstractions over per-module duplication.
- Keep workspace modules thin.
- Use TypeScript strictness.
- Avoid `any`.
- Avoid non-null assertions unless the boundary is genuinely known.
- Do not add heavyweight dependencies casually.
- Do not add Tailwind.
- Keep `.github/copilot-instructions.md` and `CLAUDE.md` in sync.

Full conventions live in:

- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [CLAUDE.md](CLAUDE.md)

---

## Current Known Technical Debt

- Sift and legacy `mz-*` CSS currently coexist.
- The README, docs, and runtime were previously out of sync; this README now
  describes the intended architecture and current migration state.
- TypeSetter still has legacy runtime block structures.
- Some module inspectors still contain inline styles and native controls.
- Some app state is split across focused stores, which is useful locally but
  will need clearer scene/project composition for portable project packages.
- The page/project package model exists in the domain direction but is not yet
  the only runtime source of truth.
- Some generated/dev-save files may be present during local development and
  should be reviewed before committing.

---

## License

TBD.
