# Moritz

Moritz is a browser-based editor for comic lettering systems: stroke-based
fonts, speech-bubble libraries, rendering styles, and final page overlays.

The current product funnel is:

```text
Glyphs + Bubbles + Styles + Images
             |
             v
          Pages
             |
             v
       Render / Export
```

Moritz is not meant to become a large standalone platform. It is becoming a
thin editor shell that arranges domain objects on a page while the shared
Christof platform owns the workbench, object model, geometry primitives, and
project-file direction.

## Quick Start

Moritz currently consumes sibling packages from `../Luise`:

```json
"@christof/magdalena": "file:../Luise/packages/magdalena",
"@christof/sigrid": "file:../Luise/packages/sigrid",
"@christof/sigrid-curves": "file:../Luise/packages/sigrid-curves",
"@christof/sigrid-geometry": "file:../Luise/packages/sigrid-geometry"
```

Install and run:

```bash
npm install --ignore-scripts
npm run dev
npm run typecheck
npm test
npm run build
```

`--ignore-scripts` avoids the current `file:` consumer issue where upstream
workspace packages try to run their `prepare` build outside the Luise monorepo.
The Vite dev server is pinned to:

```text
http://localhost:5181
```

Tested with Node 20+.

## Current Workspaces

Moritz has four main workspaces, hosted in the mandatory Magdalena shell
regions:

- `topBar`: app/module/project controls.
- `leftBar`: contents and cObject outliners.
- `rightBar`: class-wide settings for the active workspace.
- `cOptions`: per-instance options for the selected cObject.

### GlyphSetter

Edits individual glyphs as variable-width cubic Bezier strokes. It supports
anchor editing, handles, fill preview, triangulation/debug overlays, reference
font tracing, metrics import, kerning, per-font guides, and a glyph-level
animator component.

### BubbleSetter

Edits bubble presets. A bubble is a multi-layer composition where every layer
contains glyph-shaped stroke geometry plus placement, scale, rotation, fill,
visibility, and role metadata.

### StyleSetter

Edits reusable rendering styles: slant, scale, stroke width, cap behavior,
ribbon triangulation, world/tangent normal blending, spacing, and procedural
effects such as jitter, wiggle, and taper.

### TypeSetter

Composes final pages. A page contains text/bubble blocks over an optional
background image, supports per-block font/style selection, allows in-place
bubble editing, and exports SVG or PNG overlays.

## Naming And Domain Model

The nuclear element of a Moritz font is a `Glyph`.

A `Font` is a collection container: metrics, style defaults, kerning, guides,
and a `glyphs` record. A `Glyph` is the smallest universal drawable unit that
can be edited, arranged, rendered, and animated.

Core JSON data types live in [src/core/types.ts](src/core/types.ts):

- `Font`: named glyph collection plus style defaults and optional kerning/guides.
- `Glyph`: character, editing box, strokes, and optional animator component.
- `Stroke`: cubic Bezier path with vertices, handles, width/cap data, and normal
  overrides.
- `Style`: reusable rendering settings.
- `BubbleFont`: named library of bubble presets.
- `Bubble`: multi-layer drawing.
- `BubbleLayer`: one placed glyph-shaped drawing inside a bubble.
- `Page`: portable scene with dimensions, optional background, blocks, and a
  local library snapshot.
- `Block`: positioned page frame with optional bubble and text runs.
- `TextRun`: text plus font/style references and local modulations.

The current TypeSetter runtime still uses the older flat `TextBlock` shape and
converts at persistence boundaries. Moving live state to canonical
`Page -> Block -> TextRun` is the next major data-model cleanup.

## cObjects

Moritz now exposes its domain objects as Sigrid cObjects through
[src/core/moritzCObjects.ts](src/core/moritzCObjects.ts).

Current trees:

```text
font
  glyph
    animator?
    stroke
      anchor
        in handle
        out handle

bubbleFont
  bubble
    layer
      glyph
        stroke
          anchor
            handles

page
  block
    text
    bubble
      layer
        glyph
          stroke
            anchor
              handles
```

Upstream `CKind` currently supports `group` and `extrude`, so Moritz uses
semantic `group` nodes with Moritz-specific metadata in the adapter layer. When
Sigrid grows typed glyph/page/bubble cKinds, this adapter is the intended switch
point.

Selection is already cObject-driven in the visible shell:

- GlyphSetter shows the selected glyph tree in `leftBar`.
- GlyphSetter `cOptions` follows glyph, animator, stroke, anchor, and
  multi-stroke selection.
- BubbleSetter shows `bubble -> layer -> glyph -> strokes` in `leftBar`.
- TypeSetter shows `page -> block -> text/bubble -> layer -> glyph -> strokes`
  in `leftBar`.

## Glyph Animation

Animation belongs to the glyph, not to the font container.

`Glyph.animator` is pure data. The current runtime bridge is
[src/core/glyphAnimator.ts](src/core/glyphAnimator.ts), which maps Moritz glyphs
to Sigrid-style universal glyph strokes and uses upstream Sigrid curve animation
helpers. React components can preview animation, but animation is not stored as
React state.

## Sigrid Integration

Moritz currently depends on these Sigrid packages:

- `@christof/sigrid`: project-file and platform direction.
- `@christof/sigrid-geometry`: cObject helpers such as `cObject`,
  `cMarkSelection`, `cPrimarySelectedObject`, and `cSelectedObjects`.
- `@christof/sigrid-curves`: shared 2D geometry helpers.

Already adopted:

- `triangulateSimplePolygon2d` is used through the local triangulation shim.
- Sigrid cubic segment helpers replaced local Bezier segment construction,
  evaluation, and tangent math.
- Sigrid affine/glyph transform helpers replaced local transform math.
- cObjects now describe fonts, bubbles, and pages.
- glyph symbol animation uses Sigrid curve animation helpers.

Still planned:

- Replace bespoke Moritz persistence envelopes with `SigridProjectFile`.
- Continue deleting local 2D geometry helpers when upstream equivalents are
  accepted.
- Move project identity and cross-document references into Sigrid documents
  instead of app-local JSON envelopes.

The detailed queue and wishlist live in
[docs/platform-team-wishlist.md](docs/platform-team-wishlist.md).

## Magdalena Integration

Magdalena is the active UI shell direction. Moritz has deleted the old
`src/sift` interface library.

Already adopted:

- `MagdalenaProvider`.
- `MgWorkbench` and `MgViewportLayer`.
- `MgDevSettingsWindow`.
- `MgTopBar`, `MgLeftBar`, `MgRightBar`, and `MgCOptions`.
- `MgOutliner` for cObject trees.
- `MgModuleSwitcher` for top-bar module navigation with Moritz-font labels.
- The top-bar zoom slider is now a local native range input with a Moritz
  glyph label.
- The legacy Moritz colour-scheme picker has been removed; Magdalena dev
  settings now own shell theme/debug controls.
- The old Sift root, debug overlay, controls, floating window, outliner, attrs,
  layout, tokens, and CSS files have been removed.

Current app-side bridge:

- [src/ui/MoritzText.tsx](src/ui/MoritzText.tsx) renders labels through the
  active Moritz font.
- [src/ui/MoritzSelect.tsx](src/ui/MoritzSelect.tsx) renders repo-owned menu
  triggers and menu items through Moritz glyphs rather than native
  `<select>/<option>` text.

Still planned:

- Replace remaining hand-rolled inspectors and local controls with Magdalena
  mObject or Mg controls.
- Replace app-local `--mz-*` palette/chrome with Magdalena `--mg-*` tokens and
  tone/importance vocabulary.
- Replace direct React shell composition with an mObject tree once the direct
  shell is stable.

`MAGDALENA_INTEGRATION_README.md` is now only a pointer to canonical Luise docs
and the Moritz wishlist. The source of truth for current platform state is
[docs/platform-team-wishlist.md](docs/platform-team-wishlist.md).

## Code Layout

```text
src/
  core/          pure geometry, layout, rendering, data types, cObject adapters
  data/          built-in fonts, styles, bubbles, text presets
  state/         Zustand stores and current persistence wrappers
  modules/       workspace-specific React payloads for the Magdalena shell
  ui/            Moritz-specific UI bridges such as MoritzText/MoritzSelect
  app.tsx        Magdalena-hosted app shell and workspace routing
```

Everything in `src/core/` should stay pure: no DOM, no React, no browser
storage, no implicit randomness, and no hidden side effects.

The core rendering path remains:

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

Style transforms are applied to glyph control points before re-outlining.
Moritz does not warp already-rendered outlines for slant or scale changes.

## Persistence State

Current persistence is still transitional:

- fonts save as Moritz font envelopes
- styles save as Moritz style envelopes
- bubble fonts save as Moritz bubble-library envelopes
- pages save as Moritz page envelopes
- pages carry a local library snapshot so exported pages can be portable

Target persistence:

- `SigridProjectFile` is the only saved project format.
- Moritz facets use app-namespaced document kinds such as `moritz.font`,
  `moritz.style`, `moritz.bubble-font`, and `moritz.page`.
- Legacy Moritz envelopes are read once at load boundaries and upgraded in
  memory.
- Save paths write Sigrid project files, not dual formats.

## Verification

Useful commands:

```bash
npm run typecheck
npm test
npm run build
```

Current baseline after the cObject shell work:

```text
typecheck: clean
tests: 151 passed
build: clean, with Vite's existing large chunk warning
bundle: about 792 KB minified JS
```

## Known Technical Debt

- App-local `mz-*` styling still coexists with Magdalena `mg-*` shell styling.
- Persistence has not yet moved to `SigridProjectFile`.
- TypeSetter live state still uses legacy `TextBlock` data.
- Several pure 2D helpers in `src/core/` are still Rule-of-Three candidates for
  Sigrid/Sigrid-curves.
- Some inspectors still use hand-rolled React/inline styles rather than Mg
  controls.
- The app depends on local `file:` packages from `../Luise`, so the sibling repo
  layout matters during development.

## Docs

- [docs/moritz-cobject-plan.md](docs/moritz-cobject-plan.md)
- [docs/platform-team-wishlist.md](docs/platform-team-wishlist.md)
- [MAGDALENA_INTEGRATION_README.md](MAGDALENA_INTEGRATION_README.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [CLAUDE.md](CLAUDE.md)

## License

TBD.
