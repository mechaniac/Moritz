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

Moritz currently consumes the sibling Luise packages that exist in the 2026
monorepo layout:

```json
"@christof/anita": "file:../Luise/packages/anita",
"@christof/magdalena": "file:../Luise/packages/magdalena",
"@christof/sigrid": "file:../Luise/packages/sigrid"
```

Install and run:

```bash
npm install --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
npm run typecheck
npm test
npm run build
```

`--ignore-scripts` avoids the current `file:` consumer issue where upstream
workspace packages try to run their `prepare` build outside the Luise monorepo.
The default Vite config uses port `5182`; on shared dev machines, prefer an
explicit free loopback port. The current smoke-tested command serves:

```text
http://127.0.0.1:5177
```

Tested with Node 20+.

## Moritz Suite

Moritz contributes one Christof product module: `moritz`. The host workbench
topbar also registers sibling product modules from Luise: `sigrid`, `luise`,
`magdalena`, and `anita`.

Inside Moritz, the four editor work areas are internal documents/views:

- `moritz.font`: GlyphSetter.
- `moritz.bubbleFont`: BubbleSetter.
- `moritz.stylePreview`: StyleSetter.
- `moritz.page`: TypeSetter.

The global topbar is for products such as Sigrid, Luise, Magdalena, Anita, and
Moritz. GlyphSetter, BubbleSetter, StyleSetter, and TypeSetter stay inside the
Moritz leftbar/view switcher until they are intentionally split into reusable
packages.

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

Upstream `CKind` now includes `group`, `mesh`, `extrude`, and
`splineGlyph3d`. Moritz still represents its 2D font, page, and bubble trees as
semantic `group` nodes with Moritz-specific metadata in the adapter layer.
Sigrid's 3D spline-glyph cObject path is the current precedent; typed 2D
glyph/page/bubble cKinds can replace the adapter tags at this switch point.

Selection is already cObject-driven in the visible shell:

- GlyphSetter shows the selected glyph tree in the Moritz leftbar.
- GlyphSetter item controls follow glyph, animator, stroke, anchor, and
  multi-stroke selection.
- BubbleSetter shows `bubble -> layer -> glyph -> strokes` in the Moritz
  leftbar.
- TypeSetter shows `page -> block -> text/bubble -> layer -> glyph -> strokes`
  in the Moritz leftbar.

## Glyph Animation

Animation belongs to the glyph, not to the font container.

`Glyph.animator` is pure data. The current runtime bridge is
[src/core/glyphAnimator.ts](src/core/glyphAnimator.ts), which maps Moritz glyphs
to the local universal glyph shape in [src/core/glyphGeometry.ts](src/core/glyphGeometry.ts)
and uses Moritz-owned path-animation helpers. React components can preview
animation, but animation is not stored as React state.

## Sigrid Integration

Moritz currently depends on these Luise packages:

- `@christof/anita`: current Luise/Anita codebase graph package.
- `@christof/sigrid`: current Luise/Sigrid public core package.
- `@christof/magdalena`: current Luise/Magdalena public UI package.

Moritz is a thin sibling app at `C:\cWORK\Moritz` and consumes Luise only from
`C:\cWORK\Luise` through the `@christof/anita`, `@christof/sigrid`, and
`@christof/magdalena` package junctions. The app shell is a Magdalena workspace runtime mounted by
[src/app-mount.ts](src/app-mount.ts), and the active cObject trees are built in
[src/workspaceTrees.ts](src/workspaceTrees.ts).

Current local-core status:

- Triangulation, cubic segment construction, evaluation, tangent math, affine
  transforms, and glyph animation helpers are preserved locally in
  [src/core/glyphGeometry.ts](src/core/glyphGeometry.ts).
- Real Sigrid `cObject`s describe fonts, bubbles, and pages.
- Word weighting is built through Magdalena's word-weight API for the active
  Moritz tree, workbench chrome, Moritz view labels, and live interface tree.

Still planned:

- Replace bespoke Moritz persistence envelopes with `SigridProjectFile`.
- Continue deleting local 2D geometry helpers when upstream equivalents are
  accepted.
- Move project identity and cross-document references into Sigrid documents
  instead of app-local JSON envelopes.

The active migration checklist lives in
[docs/luise-migration-plan.md](docs/luise-migration-plan.md).

## Magdalena Integration

Magdalena is the active UI shell. Moritz has deleted the old `src/sift`
interface library and no longer keeps a local workbench chrome.

Already adopted:

- `MWorkbench` is mounted through Magdalena's workspace runtime.
- `moritz` is the only Moritz topbar module.
- The four editor work areas are routed by active Moritz document/view.
- The Moritz-owned rightbar overlay has been removed; durable function cards
  belong to Magdalena's docked rightbar and editor controls live inside Moritz
  view surfaces.
- The old local compatibility shell, Sift root, debug overlay, controls,
  floating window, outliner, attrs, layout, tokens, and CSS files have been
  removed.

Current app-side bridge:

- [src/ui/MoritzText.tsx](src/ui/MoritzText.tsx) renders labels through the
  active Moritz font.
- [src/ui/MoritzSelect.tsx](src/ui/MoritzSelect.tsx) renders repo-owned menu
  triggers and menu items through Moritz glyphs rather than native
  `<select>/<option>` text, while its chrome uses Magdalena tokens.

Still planned:

- Replace remaining hand-rolled inspectors and local controls with Magdalena
  mObjects.
- Replace app-local `--mz-*` palette/chrome with Magdalena `--mg-*` tokens and
  tone/importance vocabulary.
- Replace direct React shell composition with an mObject tree once the direct
  shell is stable.

The source of truth for the Luise migration is
[docs/luise-migration-plan.md](docs/luise-migration-plan.md).

## Code Layout

```text
src/
  core/          pure geometry, layout, rendering, data types, cObject adapters
  data/          built-in fonts, styles, bubbles, text presets
  state/         Zustand stores and current persistence wrappers
  modules/       Moritz internal editor views for the Magdalena shell
  ui/            Moritz-specific UI bridges such as MoritzText/MoritzSelect
  workspace.tsx  Moritz cModule, documents/views, and Magdalena slot bindings
  app-mount.ts   Magdalena workspace runtime and workbench mount
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

Current baseline after the mother-platform adoption pass:

```text
typecheck: clean
tests: 152 passed
build: clean, with Vite's existing large chunk warning
bundle: about 794 KB minified JS
```

## Known Technical Debt

- App-local `mz-*` styling still coexists with Magdalena `mg-*` shell styling.
- Persistence has not yet moved to `SigridProjectFile`.
- TypeSetter live state still uses legacy `TextBlock` data.
- Several pure 2D helpers are still Rule-of-Three candidates for future
  Sigrid/Magdalena public APIs.
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
