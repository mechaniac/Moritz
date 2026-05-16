# Moritz cObject Plan

Status: active
Date: 2026-05-15

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
- Repo-owned menus in `src/modules` and `src/ui` now render their trigger and
  menu item captions through `MoritzSelect`, which uses `MoritzLabel` rather
  than native `<select>/<option>` text. This is a temporary app-side bridge
  until Magdalena can render selectable labels as cObjects.
- BubbleFont and live TypeSetter pages now have cObject adapters too:
  `bubbleFont -> bubble -> layer -> glyph -> strokes` and
  `page -> block -> text/bubble -> layer -> glyph -> strokes`. BubbleSetter
  and TypeSetter mount those trees through `MgOutliner`, so page blocks and
  bubble layers now share the same cObject identity path as font glyphs.

## Next Slices

1. Promote TypeSetter's live legacy `TextBlock` state to the canonical
   `Page -> Block -> TextRun` runtime model so the cObject tree no longer needs
   a compatibility adapter.
2. Replace remaining hand-rolled left/right panel controls with Magdalena mObject
   or Mg controls.
3. Move persistence to `SigridProjectFile`, storing font/glyph cObject identity
   rather than app-local envelopes.
4. Replace shell call sites with an mObject tree once the current direct React
   shell is stable.
