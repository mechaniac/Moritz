# Moritz True Luise Migration Plan

Status: implemented
Date: 2026-06-21

Moritz remains a sibling child app at `C:\cWORK\Moritz`. It must consume only
the current Luise workspace at `C:\cWORK\Luise`, use real Sigrid data and real
Magdalena chrome, and keep Moritz-specific code limited to font, bubble, style,
page, and editor behavior.

## Checklist

- [x] Replace the local shell compatibility layer with Magdalena's mounted
  workbench runtime.
- [x] Declare Moritz as a workspace manifest: modules, documents, bindings,
  services, and initial state.
- [x] Convert Moritz object adapters to real Sigrid `cObject` trees with stable
  `cId`, meaningful `extras.displayName`, and namespaced Moritz components.
- [x] Register Moritz as one real `cModule`; keep GlyphSetter, BubbleSetter,
  StyleSetter, and TypeSetter as Moritz-internal documents/views bound into
  workbench slots.
- [x] Register sibling package modules `sigrid`, `magdalena`, and `anita` alongside Moritz in the workbench topbar.
- [x] Build workspace word weights through Magdalena and pass them into the
  workbench props.
- [x] Keep Zustand only for editor-internal domain state during this migration
  slice; shell module/document/selection state belongs to Sigrid workspace.
- [x] Delete old compatibility files once no imports remain.
- [x] Keep reusable missing platform behavior in Luise; keep only Moritz-specific
  authoring math in Moritz.

## Acceptance

- [x] `npm.cmd run check:luise-migration` passes.
- [x] `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` pass.
- [x] The browser DOM contains real Sigrid/Magdalena workbench markers such as
  `c-workbench`, `data-m`, and `m-weighted-name`.
- [x] The browser DOM does not contain local compatibility shell markers.
- [x] Product switching is driven by the Magdalena workbench topbar; Moritz
  work-area switching happens inside the Moritz module and preserves existing
  editor workflows.

## Verification Log

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 158 tests.
- `npm.cmd run build`: passed; Vite reported only the existing large chunk
  warning.
- `npm.cmd run check:luise-migration`: passed.
- `node_modules/@christof/anita`, `node_modules/@christof/magdalena`, and
  `node_modules/@christof/sigrid`
  resolve to junctions under `C:\cWORK\Luise\packages`.
- Browser smoke at `http://127.0.0.1:5177/`: HTTP 200; screenshot confirmed
  topbar modules `moritz`, `sigrid`, `magdalena`, and `anita`.
