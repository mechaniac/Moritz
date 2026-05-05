# Moritz

A **parametric comic-book lettering engine** — a web app that synthesizes a
handwritten comic typeface from editable stroke-based glyph drawings, then lets
you place that lettering onto a comic page and export it as SVG or transparent
PNG.

Moritz is *opinionated*, not blank-slate: every new font starts as a clone of
a built-in base font that already covers all required glyphs. You edit, swap,
add, or remove — never start from zero. There are no separate "bold" or
"italic" cuts; both are just parameter modulations of one base style.

---

## Quick start

```bash
npm install
npm run dev      # vite dev server (http://localhost:5173)
npm test         # vitest
npm run typecheck
npm run build
```

Tested with Node 20+.

---

## The three modules

The app is split into three top-level workspaces, switched from the header bar:

1. **GlyphSetter** — a raster grid of every glyph in the active font plus a
   single-glyph editor (Illustrator-style splines: drag anchors and tangent
   handles, alt-click a stroke to insert an anchor, alt-click an anchor to
   toggle corner ⇄ smooth, choose `miter` or `bevel` join for hard corners).
   Toolbar toggles for fill preview, anchor visibility, and debug borders.
2. **StyleSetter** — sliders bound to the typeface-wide `StyleSettings`:
   slant, X/Y scale, stroke width, world-vs-tangent width orientation, start &
   end cap shape (round / flat / tapered). Live preview of the whole alphabet,
   plus save/load of named typefaces.
3. **TypeSetter** — work area. Place text blocks (rect / speech bubble /
   thought cloud) on a transparent page, type into them, drag the speech tail,
   override per-block font size / bold / italic. Export selected text or whole
   page as SVG / PNG with transparency.

---

## How a glyph becomes pixels

```
Font + StyleSettings + text
      │
      ▼  layout(text, font, style)            -> PositionedGlyph[]
      ▼  transform(glyph, style)              -> transformed Strokes
      ▼  outline(stroke, style)               -> filled Polygon (variable width)
      ▼  render(polygons, target: SVG|Canvas)
```

Every stage is a **pure function** of its inputs, lives in `src/core/`, and
has Vitest unit tests in `tests/core/`.

The critical rule: when slant or X/Y scale changes, we do **not** warp the
already-rendered shape. Instead we apply the affine transform to each anchor
and handle, then re-evaluate the Bézier and re-outline it. Stroke thickness
and curvature stay natural under stretch and slant.

Stroke outlining (`src/core/stroke.ts`) samples each cubic Bézier segment
independently, builds two offset polylines (±half-width along the normal),
and stitches consecutive segments at corners with a **miter join** —
trimming any samples that overshoot the intersection so inside corners stay
clean. Sharp corners fall back to a bevel automatically (or whenever the
selected anchor is marked `bevel`).

---

## Domain model (canonical)

All types live in [src/core/types.ts](src/core/types.ts). Everything is
immutable and JSON-serializable — no class instances, no functions on data
objects. A font is just data:

```ts
type Font = {
  id: string;
  name: string;
  style: StyleSettings;             // typeface-wide knobs
  glyphs: Record<string, Glyph>;    // keyed by single character
};
```

Fonts persist to `localStorage` under `moritz.fonts.<id>` and import/export
via a `.moritz.json` envelope: `{ format: 'moritz-font', version: 1, font }`.

---

## Layout

```
src/
  core/                     # PURE. no DOM, no React.
    types.ts
    bezier.ts               # cubic-Bézier helpers (wraps bezier-js)
    transform.ts            # affine on control points
    stroke.ts               # variable-width outliner with miter joins
    layout.ts               # text → positioned glyphs
    bubble.ts               # rect / speech / cloud geometry
    glyphOps.ts             # immutable glyph editing operations
    export/{svg,png}.ts
  data/defaultFont.ts       # built-in base glyph set (A-Z a-z 0-9 . ? !)
  state/                    # zustand stores wrapping pure reducers
  modules/
    glyphsetter/
    stylesetter/
    typesetter/
  ui/                       # shared primitives
  app.tsx
tests/                      # vitest, mirrors src/core
```

---

## Stack

- Vite 5 + TypeScript 5 (strict) + React 18
- Canvas 2D / SVG for editor handles, SVG for vector export
- [`bezier-js`](https://pomax.github.io/bezierjs/) for accurate Bézier math
- [Zustand](https://zustand-demo.pmnd.rs/) for state (thin shell over pure
  reducers)
- [Vitest](https://vitest.dev/) for tests

---

## Coding rules (short version)

- **Functional core, imperative shell.** Anything in `src/core/` is pure: no
  DOM, no React, no `Date.now()`, no `Math.random()`. Side effects live in
  `src/state/` or the module shells.
- **Immutability.** Reducers return new objects. Use `readonly`.
- **TypeScript strict.** No `any`; no non-null `!` except at well-justified
  boundaries.
- **Tests live in `tests/`** mirroring `src/core/`. Every pure helper in
  `core/` has at least one Vitest test.
- **No new heavyweight deps without justification.** Approved baseline:
  React, Zustand, bezier-js, Vitest.

The full conventions live in
[.github/copilot-instructions.md](.github/copilot-instructions.md) and the
mirror copy [CLAUDE.md](CLAUDE.md). Keep the two in sync.

---

## License

TBD.
