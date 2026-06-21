# Moritz Suite Architecture Plan

Status: implemented
Date: 2026-06-21

Moritz is one loadable Christof product. The global workbench topbar should
show Moritz once, next to products such as Sigrid, Luise, Magdalena, and Anita.
GlyphSetter, BubbleSetter, StyleSetter, and TypeSetter are Moritz-internal
work areas until they are deliberately split into independently reusable
packages.

## Target Shape

- [x] Register exactly one Moritz `cModule` with id `moritz`.
- [x] Keep four Moritz documents/views:
  - `moritz.font` for GlyphSetter.
  - `moritz.bubbleFont` for BubbleSetter.
  - `moritz.stylePreview` for StyleSetter.
  - `moritz.page` for TypeSetter.
- [x] Route viewport, leftbar, and workbench settings by active Moritz
  document/view, not by active topbar module.
- [x] Remove Moritz-owned `rightbar` bindings and the floating rightbar bridge.
- [x] Keep the docked Magdalena rightbar for real gateway/workbench function
  cards.
- [x] Preserve existing editor workflows first; split reusable packages only
  after the internal suite boundary is stable.

## Package Direction

Do not split the four editors into top-level cModules yet. First extract
reusable code by capability:

- `moritz-core`: pure font, glyph, bubble, page, export, and geometry logic.
- `moritz-glyphs`: glyph/font cObject builders and reusable glyph operations.
- `moritz-editors`: optional reusable React editor surfaces.
- `moritz`: suite package/module that composes the work areas.

The package split is ready only when each exported piece has a public API,
tests, no hidden Zustand coupling to the suite, and a clear consumer story.

## Verification Log

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 157 tests.
- `npm.cmd run build`: passed; Vite reported only the existing large chunk
  warning.
- `npm.cmd run check:luise-migration`: passed.
- Browser smoke at `http://127.0.0.1:5173/`: HTTP 200; real workbench markers
  present; floating rightbar marker count `0`, legacy shell marker count `0`,
  and Vite error marker count `0`.
