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

## For Users

You're letterers, comic artists, or anyone laying out a page who just wants
clean handwritten text on top of artwork.

- **Open the app, go to TypeSetter.** Drag a comic page in as the background
  (it stays transparent in exports). Place a rect, a speech bubble, or a
  thought cloud on top, type into it, and drag the speech tail to the
  speaker.
- **Pick a typeface** from the header. Per-block sliders override the
  typeface size, bold-multiplier, and italic-multiplier — no separate
  "bold" font to load, those are just stronger settings of the same base.
- **Export** the selection or the whole page as SVG (vector, infinite
  zoom) or transparent PNG at the DPI you choose. Both formats keep the
  page background out — only the lettering and bubbles ship.
- **Save your work locally.** Fonts and pages live in `localStorage`; use
  the import/export buttons to move `.moritz.json` files between machines.

---

## For Font Designers

You want to draw and tune a handwritten alphabet without becoming a font
engineer.

- **Start from a clone, never from blank.** Every new font is a copy of the
  built-in base font, which already covers `A–Z a–z 0–9 . ? !`. Edit what
  you want different; leave the rest.
- **GlyphSetter** is the per-glyph workshop. Each glyph is a set of
  variable-width strokes built from cubic-Bézier splines:
  - drag anchors and tangent handles like in Illustrator,
  - `+ Anchor` inserts on the selected segment, `− Delete` removes,
  - alt-click an anchor to flip it between corner and smooth,
  - mark hard corners as `miter` or `bevel`,
  - import metrics (advance + side bearings) from any installed CSS font
    so your glyphs sit on the same width grid as a reference family.
- **The Kerning tab** lets you author pair deltas by hand, or click
  *Import kerning from reference font* to lift the whole table from your
  reference family in one pass.
- **StyleSetter** is where the typeface comes alive without touching a
  single anchor. Every slider modulates the same base drawings:
  - slant, X/Y scale, stroke width,
  - **world↔tangent width blend** for nib-style strokes,
  - cap shape on each end (round / flat / tapered),
  - an **Effects** section — spline jitter, shape jitter, width wiggle,
    width taper — each with a scope (per-instance, per-glyph, per-text)
    and a shared seed. The preview re-renders within a frame; the seed
    is deterministic, so the same settings always render the same shapes.
- **No separate cuts.** "Bold" is just a stronger width; "italic" is just
  more slant. One base, modulated.

---

## For Engineers

You want to read or extend the code.

- **Stack:** Vite 5 + TypeScript 5 (strict) + React 18, Zustand for state,
  `bezier-js` for Bézier math, `earcut` for polygon triangulation, Vitest.
  No CSS framework, no UI kit.
- **Functional core, imperative shell.** Everything in `src/core/` is pure:
  no DOM, no React, no `Date.now()`, no `Math.random()`. Side effects live
  in `src/state/` (Zustand stores wrapping pure reducers) and the module
  shells under `src/modules/`.
- **Pipeline.** `layout → transform → outline (stroke) → render (svg/canvas)`,
  each stage a pure function memoized by reference equality. Style changes
  re-evaluate Béziers; they never warp the already-rendered shape, so
  thickness and curvature stay natural under stretch and slant.
- **Determinism.** Stochastic effects use a `mulberry32` PRNG seeded from
  the effect's scope, the glyph's position in the run, and a user-controlled
  seed slider. Same `(font, text, effects)` tuple → same SVG every time.
- **Data is plain JSON.** A `Font` is `{ id, name, style, glyphs, kerning? }`
  with no class instances and no functions. `JSON.stringify` round-trips it.
- **Tests live in `tests/`** mirroring `src/core/`. Every pure helper has at
  least one Vitest test (76 at the time of writing). Run `npm test` after
  any change in `core/`.
- **Conventions** in [.github/copilot-instructions.md](.github/copilot-instructions.md)
  and the mirror [CLAUDE.md](CLAUDE.md). Keep them in sync.

---

## The three modules

The app is split into three top-level workspaces, switched from the header bar:

1. **GlyphSetter** — a raster grid of every glyph in the active font plus a
   single-glyph editor (Illustrator-style splines: drag anchors and tangent
   handles, `+ Anchor` inserts a new anchor on the selected segment, alt-click
   an anchor to toggle corner ⇄ smooth, choose `miter` or `bevel` join for
   hard corners). Toolbar toggles for fill preview, anchor visibility, and
   debug borders. The left column also has a **Kerning** tab: edit pair
   deltas by hand, or click *Import kerning from reference font* to extract
   them from a CSS reference family in one shot. A per-glyph *Import metrics*
   button lifts advance + side bearings from the same reference font.
2. **StyleSetter** — sliders bound to the typeface-wide `StyleSettings`:
   slant, X/Y scale, stroke width, **world↔tangent width blend** (continuous
   0..1, with a world-angle slider for the nib), start & end cap shape
   (round / flat / tapered), and an **Effects** section: spline jitter, shape
   jitter, width wiggle, width taper (whole-stroke or repeating by length),
   each with a scope picker (per-instance / per-glyph / per-text) and a
   shared deterministic seed. Live preview of the whole alphabet, plus
   save/load of named typefaces.
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
selected anchor is marked `bevel`). The width orientation is a continuous
blend between the path tangent normal and a fixed world-angle nib, and the
width at any point can be modulated by a `widthMod(t)` function (used by the
width-wiggle and taper effects).

Stochastic effects are deterministic: every `mulberry32` PRNG seed is derived
from the effect's scope (per-instance / per-glyph / per-text), the glyph's
position in the run, and a user-controlled seed slider, so the same
`(font, text, effects)` tuple always renders identically.

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
    ribbon.ts               # triangulated stroke ribbon (canvas preview)
    triangulate.ts          # earcut wrapper for filled polygons
    layout.ts               # text → positioned glyphs (with kerning)
    bubble.ts               # rect / speech / cloud geometry
    glyphOps.ts             # immutable glyph editing operations
    random.ts               # mulberry32 PRNG + seed hashing
    effects.ts              # spline + shape jitter
    widthEffects.ts         # width wiggle + taper modulators
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
