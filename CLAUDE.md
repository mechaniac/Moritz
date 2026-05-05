# CLAUDE.md — Moritz

> Mirror of `.github/copilot-instructions.md`. Keep these two files in sync; if they
> diverge, `.github/copilot-instructions.md` wins. This file exists so Claude Code
> and other agents pick up the same conventions automatically.

Moritz is a **parametric comic-book lettering engine**: a web app that synthesizes a
handwritten comic typeface from editable stroke-based glyph drawings, then lets the
user place that lettering onto a comic page and export it as SVG or transparent PNG.

---

## 1. Product principles

1. **Opinionated, not blank-slate.** Every new font starts as a clone of a built-in
   base font that already covers all required glyphs. The user edits, swaps, adds,
   or removes — never starts from zero.
2. **Single source of truth per typeface.** One base style, manipulated in real time
   by typeface-wide settings and per-glyph / per-run overrides. We do not ship
   separate "bold" or "italic" cuts — those are parameter modulations.
3. **Real-time everywhere.** Every slider/numeric input updates the preview within
   a frame. Memoize the pipeline; never re-render what hasn't changed.
4. **Vector-first.** The canonical render target is SVG. PNG is a rasterization of
   the SVG at user-chosen DPI with alpha.

---

## 2. Domain model (canonical)

All types live in `src/core/types.ts`. Everything is **immutable** and
**JSON-serializable** (no class instances, no functions on data objects).

```ts
type Vec2 = { x: number; y: number };

// Illustrator-style anchor: position + incoming/outgoing handle (relative to p).
type Vertex = { p: Vec2; inHandle: Vec2; outHandle: Vec2 };

// width(t) profile along the stroke, t in [0,1]. Linear interp between samples.
type WidthProfile = { samples: { t: number; width: number }[] };

type CapShape = 'round' | 'flat' | 'tapered' | { kind: 'custom'; path: Vertex[] };

type Stroke = {
  id: string;
  vertices: Vertex[];           // >= 2; cubic-bezier segments between consecutive
  width?: WidthProfile;         // optional override of StyleSettings.defaultWidth
  capStart?: CapShape;
  capEnd?: CapShape;
};

type Glyph = {
  char: string;
  box: { w: number; h: number }; // glyph advance box in font units
  strokes: Stroke[];
};

type WidthOrientation = 'tangent' | 'world';

type StyleSettings = {
  slant: number;                // radians; shears x by tan(slant) * y
  scaleX: number;
  scaleY: number;
  defaultWidth: WidthProfile;
  widthOrientation: WidthOrientation;
  worldAngle: number;           // radians; only when widthOrientation === 'world'
  capStart: CapShape;
  capEnd: CapShape;
};

type Font = {
  id: string;
  name: string;
  style: StyleSettings;
  glyphs: Record<string, Glyph>;
};
```

### The transform rule (critical)

When `StyleSettings.{slant, scaleX, scaleY}` change, **do not warp the rendered
shape**. Apply the affine transform to each `Vertex.p`, `inHandle`, and
`outHandle`, then re-evaluate the Bézier and re-outline. This keeps stroke
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

Every stage is a **pure function**. Stages live in `src/core/`:

- `layout.ts` — text → positioned glyph instances (advance widths, line breaks).
- `transform.ts` — applies `StyleSettings` affine to a glyph's vertices.
- `stroke.ts` — samples the cubic Bézier, computes normals (tangent or world),
  offsets ±width/2, joins offset polylines, attaches caps → closed polygon.
- `bezier.ts` — low-level cubic Bézier helpers (sample, tangent, length, split);
  wraps `bezier-js`. The rest of the code talks only to our wrapper.
- `export/svg.ts`, `export/png.ts` — final serialization.

**Memoization**: each stage is keyed by structural identity of its inputs. Because
state is immutable, reference equality is enough.

---

## 4. Modules (UI)

Three top-level modules under `src/modules/`:

1. **glyphsetter/** — raster grid of all glyphs in the active font, plus a
   selected-glyph editor (Illustrator-style spline tool: add/remove strokes, add/
   remove anchors, drag points and tangent handles). Reducers are pure; the editor
   only emits intents (`ADD_ANCHOR`, `MOVE_HANDLE`, …).
2. **stylesetter/** — sliders + numeric inputs bound to `StyleSettings`; live
   preview of the whole alphabet; save/load named typefaces.
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
  `Date.now()`, no `Math.random()`, no DOM, no React. Side effects live in
  `src/state/` or the module shells.
- **Immutability.** Never mutate inputs. Return new objects. Use `readonly`.
- **DRY but not premature.** Extract a helper the second time a pattern appears,
  not the first.
- **Comment the why.** Public functions in `core/` get a short JSDoc explaining
  inputs, outputs, and any non-obvious math (especially `transform.ts` and
  `stroke.ts`).
- **Tests** live in `tests/` mirroring `src/core/`. Every pure helper in `core/`
  has at least one Vitest unit test. SVG snapshot tests for the default font catch
  rendering regressions.
- **No new heavyweight deps without justification.** Approved baseline: React,
  Zustand, bezier-js, Vitest.

### Stack

- Vite + TypeScript + React
- Canvas 2D for realtime preview, SVG for editor handles + vector export
- `bezier-js` for accurate Bézier math
- Zustand for state (thin shell over pure reducers)
- Vitest for tests

### Folder layout

```
src/
  core/                     # PURE. no DOM, no React.
    types.ts
    bezier.ts
    transform.ts
    stroke.ts
    layout.ts
    export/{svg,png}.ts
  data/defaultFont.ts       # built-in base glyph set
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

## 6. Data & persistence

- Fonts are plain JSON (`Font` type) — `JSON.stringify` / `JSON.parse`, no codec.
- Built-in base font lives in `src/data/defaultFont.ts` as a typed constant.
- User-saved fonts go to `localStorage` under `moritz.fonts.<id>` in v1; an
  import/export `.moritz.json` button covers portability.

---

## 7. Open questions / TBD

Track in code with `// TODO(decision):` and raise in PRs.

1. **Default cap shape** — the brief was cut off ("Strokes are capped on both ends
   with …"). Default assumed `round`; confirm with user.
2. **Bubble / cloud shapes** in TypeSetter — preset set vs free-draw.
3. **Kerning** — none in v1; add as `Font.kerning?: Record<string, number>` later.
4. **Multi-character ligatures** — out of scope for v1.

---

## 8. Definition of done

- [ ] Types in `core/types.ts` updated if the domain changed.
- [ ] Pure functions touched have/keep Vitest tests.
- [ ] No new lint or `tsc --noEmit` errors.
- [ ] Realtime preview still updates within one frame on the default font.
- [ ] If rendering changed: SVG snapshot tests reviewed and updated intentionally.
- [ ] Both `CLAUDE.md` and `.github/copilot-instructions.md` updated together when
      conventions change.

---

## 9. Workflow notes for Claude

- Read `src/core/types.ts` before touching any rendering or state code.
- When asked to "add a feature", first identify which pipeline stage it belongs to
  (`layout` / `transform` / `stroke` / `render`) and stay inside that stage.
- Prefer adding a pure helper in `core/` over expanding a UI component.
- Run `npm test` (Vitest) after any change in `core/`.
- Run `npm run dev` and visually confirm the StyleSetter preview after touching
  `transform.ts` or `stroke.ts`.
