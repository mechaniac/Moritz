# Moritz — Copilot Instructions

Moritz is a **parametric comic-book lettering engine**: a web app that synthesizes a
handwritten comic typeface from editable stroke-based glyph drawings, then lets the
user place that lettering onto a comic page and export it as SVG or transparent PNG.

These instructions are the source of truth for how the codebase is structured and how
new code must be written. Keep them in sync with `CLAUDE.md` (they should stay
near-identical).

---

## 1. Product principles

1. **Opinionated, not blank-slate.** Every new font starts as a clone of a built-in
   base font that already covers all required glyphs. The user edits, swaps, adds, or
   removes — never starts from zero.
2. **Single source of truth per typeface.** One base style, manipulated in real time
   by typeface-wide settings and per-glyph / per-run overrides. We do not ship
   separate "bold" or "italic" cuts — those are parameter modulations.
3. **Real-time everywhere.** Every slider/numeric input updates the preview within a
   frame. Memoize the pipeline, never re-render what hasn't changed.
4. **Vector-first.** The canonical render target is SVG. PNG is a rasterization of
   the SVG at user-chosen DPI with alpha.

---

## 2. Domain model (canonical)

All types live in `src/core/types.ts`. Everything is **immutable** and
**JSON-serializable** (no class instances, no functions on data objects).

```ts
type Vec2 = { x: number; y: number };

// Illustrator-style anchor: position + incoming/outgoing handle (both relative to p).
type Vertex = { p: Vec2; inHandle: Vec2; outHandle: Vec2 };

// width(t) profile along the stroke, t in [0,1]. Linear interp between samples.
type WidthProfile = { samples: { t: number; width: number }[] };

type CapShape = 'round' | 'flat' | 'tapered' | { kind: 'custom'; path: Vertex[] };

type Stroke = {
  id: string;
  vertices: Vertex[];           // >= 2; cubic-bezier segments between consecutive
  width?: WidthProfile;         // optional override of StyleSettings.defaultWidth
  capStart?: CapShape;          // optional override
  capEnd?: CapShape;
};

type Glyph = {
  char: string;                 // single grapheme; key in Font.glyphs
  box: { w: number; h: number }; // glyph advance box in font units
  strokes: Stroke[];
};

type WidthOrientation = 'tangent' | 'world';

type StyleSettings = {
  slant: number;                // radians; shears x by tan(slant) * y
  scaleX: number;               // box stretch X
  scaleY: number;               // box stretch Y
  defaultWidth: WidthProfile;
  widthOrientation: WidthOrientation;
  worldAngle: number;           // radians; only used when widthOrientation === 'world'
  capStart: CapShape;
  capEnd: CapShape;
  // Future: jitter, baseline noise, pressure curve, etc.
};

type Font = {
  id: string;
  name: string;
  style: StyleSettings;
  glyphs: Record<string, Glyph>;  // keyed by single-character string
};
```

### The transform rule (critical)

When `StyleSettings.{slant,scaleX,scaleY}` change we **do not warp the rendered
shape**. We apply the affine transform to each `Vertex.p`, `inHandle`, and
`outHandle`, then re-evaluate the Bézier and re-outline it. This keeps stroke
thickness and curvature looking natural under stretch/slant.

---

## 3. Rendering pipeline

```
Font + StyleSettings + text
      │
      ▼  layout(text, font, style)            -> PositionedGlyph[]
      ▼  transform(glyph, style)              -> transformed Strokes
      ▼  outline(stroke, style)               -> filled Polygon (variable-width)
      ▼  render(polygons, target: SVG|Canvas)
```

Every stage is a **pure function** of its inputs. Stages live in `src/core/`:

- `layout.ts`   — text → positioned glyph instances (advance widths, line breaks).
- `transform.ts`— applies `StyleSettings` affine to a glyph's vertices.
- `stroke.ts`   — samples the cubic Bézier, computes normals (tangent or world),
  offsets ±width/2, joins offset polylines, attaches caps → closed polygon.
- `bezier.ts`   — low-level cubic Bézier helpers (sample, tangent, length, split).
  Wrap `bezier-js` here; the rest of the code talks only to our wrapper.
- `export/svg.ts`, `export/png.ts` — final serialization.

**Memoization**: each stage is keyed by the structural identity of its inputs.
Because state is immutable, reference equality is enough. Use `useMemo` in React
boundaries; in `core/` keep tiny WeakMap caches when needed.

---

## 4. Modules (UI)

Three top-level modules under `src/modules/`:

1. **glyphsetter/** — raster grid of all glyphs in the active font, plus a single
   selected-glyph editor: add/remove strokes, add/remove anchors, drag points and
   tangent handles (Illustrator-style). Pure-functional reducers; the editor view
   only emits intents (`ADD_ANCHOR`, `MOVE_HANDLE`, …).
2. **stylesetter/** — sliders + numeric inputs bound to `StyleSettings`. Live
   preview of the whole alphabet. Save/load named typefaces.
3. **typesetter/** — work area. Load a comic page image as background, place text
   blocks (rect / speech bubble / thought cloud), input text, per-word overrides
   (size, bold-multiplier, italic-multiplier). Export selected text or whole page
   as SVG/PNG with transparency.

UI modules are thin — they translate user input into intents and render the output
of `core/`. **No domain logic in components.**

---

## 5. Coding rules

- **TypeScript strict.** No `any`. No non-null `!` except at well-justified
  boundaries.
- **Functional core, imperative shell.** Everything in `src/core/` is pure: no
  `Date.now()`, no `Math.random()`, no DOM, no React. Side effects (state writes,
  canvas draws, file saves) live in `src/state/` or the module shells.
- **Immutability.** Never mutate inputs. Return new objects. Use `readonly` in
  signatures. Reducers return new state.
- **DRY but not premature.** Extract a helper the second time a pattern appears,
  not the first.
- **Comment the why, not the what.** Public functions in `core/` get a short
  JSDoc explaining inputs, outputs, and any non-obvious math (especially
  `transform.ts` and `stroke.ts`).
- **Tests live next to code logically** but in `tests/` mirroring `src/core/`.
  Every pure helper in `core/` has at least one Vitest unit test. Add SVG snapshot
  tests for the default font's rendered glyphs to catch regressions.
- **No new heavyweight deps without justification.** Approved baseline: React,
  Zustand, bezier-js, Vitest. Anything else: discuss first.

---

## 6. Data & persistence

- Fonts are plain JSON (the `Font` type). They serialize/deserialize with
  `JSON.stringify` / `JSON.parse` — no custom codec.
- The built-in base font lives in `src/data/defaultFont.ts` as a typed constant.
- User-saved fonts go to `localStorage` (key: `moritz.fonts.<id>`) for v1; an
  import/export `.moritz.json` button covers portability.

---

## 7. Open questions / TBD

Track these in code with `// TODO(decision):` and surface in PRs.

1. **Default cap shape** — the brief was cut off ("Strokes are capped on both ends
   with …"). Default assumed `round`; confirm with user. All four cap kinds are in
   the type already.
2. **Bubble / cloud shapes** in TypeSetter — set of presets vs free-draw.
3. **Kerning** — none in v1; add as `Font.kerning?: Record<string, number>` later.
4. **Multi-character ligatures** — out of scope for v1.

---

## 8. Definition of done for any change

- [ ] Types in `core/types.ts` updated if the domain changed.
- [ ] Pure functions touched have/keep Vitest tests.
- [ ] No new lint or `tsc --noEmit` errors.
- [ ] Realtime preview still updates within one frame on the default font.
- [ ] If rendering changed: SVG snapshot tests reviewed and updated intentionally.
- [ ] `copilot-instructions.md` and `CLAUDE.md` updated together when conventions
      change.
