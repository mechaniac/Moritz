# CLAUDE.md — Moritz

> Mirror of `.github/copilot-instructions.md`. Keep these two files in sync; if they
> diverge, `.github/copilot-instructions.md` wins. This file exists so Claude Code
> and other agents pick up the same conventions automatically.

Moritz is a **font, bubble and page generator** for comic-book lettering: a web app
that lets the user design every layer — individual glyphs, the typeface-wide style,
speech-bubble shapes, and the final page — separately and immediately, then export
the result as SVG or transparent PNG.

---

## 1. Product principles

1. **Opinionated, not blank-slate.** Every new font / bubble / page starts as a
   clone of a built-in default that already covers all required parts. The user
   edits, swaps, adds, or removes — never starts from zero.
2. **Single source of truth per artefact.** One base style per typeface, one set of
   layers per bubble, one block list per page — manipulated in real time by
   workspace-wide settings and per-element overrides. We do not ship separate
   "bold" or "italic" cuts; those are parameter modulations.
3. **Real-time everywhere.** Every slider / numeric input / drag updates the
   preview within a frame. Memoize the pipeline; never re-render what hasn't
   changed.
4. **Vector-first.** The canonical render target is SVG. PNG is a rasterization of
   the SVG at user-chosen DPI with alpha.
5. **One workspace, four lenses.** All four workspaces (GlyphSetter, StyleSetter,
   BubbleSetter, TypeSetter) are practically identical: an endless vector space
   with floating elements, the same camera/pan/zoom model, the same selection +
   handle visuals, the same export pipeline. They differ **only** in which
   element is in focus, which inspector panels are shown, and which grid /
   guides are drawn. Whenever a behaviour can be made shared, it must be — any
   divergence is a bug, not a feature.
6. **Edit any layer in any context.** A glyph is editable from the GlyphSetter
   *and* from a TypeSetter block; a bubble is editable from the BubbleSetter
   *and* from the page; a typeface style is editable from the StyleSetter *and*
   inline on the page. Selection of an element activates editing for that
   element directly — no "open in editor" buttons, no modal takeovers.
7. **Per-element assignment.** Pages contain blocks; blocks contain a bubble and
   one or more text runs. Each text run carries its own font + style reference,
   and each bubble carries its own style reference. A page can therefore mix
   any number of fonts, styles, and bubble designs.

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

// ---- Page hierarchy ------------------------------------------------------

type TextRun = {
  id: string;
  text: string;
  fontId: string;             // one of the fonts in the page library
  styleId: string;            // one of the styles in the page library
  boldFactor?: number;        // multiplier on stroke width, default 1
  slantDelta?: number;        // radians added to style.slant, default 0
  fontSize: number;           // page units (px)
  align?: 'left' | 'center' | 'right';
};

type Block = {
  id: string;
  x: number; y: number;
  w: number; h: number;
  bubble?: {
    bubbleId: string;
    styleId: string;
    override?: Bubble;        // clone-on-edit per-instance override
  };
  texts: TextRun[];
};

type Page = {
  id: string;
  w: number; h: number;
  background?: string;
  blocks: Block[];
  library: {
    fonts: Record<string, Font>;
    styles: Record<string, StyleSettings>;
    bubbles: Record<string, Bubble>;
  };
};
```

> Status: `Page` / `Block` / `TextRun` above are the **target** shape. The
> current code still uses a single global font + style and a flat
> `TextBlock` (see `src/state/typesetterStore.ts`); migrating to per-run
> font/style references is tracked in § 7.

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

All workspaces share **the same canvas shell**: an infinite pannable / zoomable
vector space, the same selection model, the same handle visuals
(`StrokeOverlay`), the same export pipeline. They differ only in which floating
elements are placed, which inspector panels appear, and which grid / guides are
drawn. New shared behaviour belongs in `src/ui/canvas/` (the shell) or
`src/core/` (pure logic), **not** copy-pasted into a workspace. Any divergence
between workspaces is a bug to be removed.

Four top-level modules under `src/modules/`:

1. **glyphsetter/** — floating elements: every glyph in the active font, laid
   out as a grid; selection enters Illustrator-style spline editing on that
   glyph. Reducers are pure; the editor only emits intents (`ADD_ANCHOR`,
   `MOVE_HANDLE`, …).
2. **stylesetter/** — floating elements: a live alphabet preview rendered with
   the active style. Inspector: sliders + numeric inputs bound to
   `StyleSettings`; save/load named styles.
3. **bubblesetter/** — floating elements: every bubble in the active bubble
   library; selection enters in-place layer + spline editing on that bubble.
4. **typesetter/** — floating elements: the page background and every block.
   Selecting a block reveals its bubble's spline handles in place (same
   `StrokeOverlay` as GlyphSetter / BubbleSetter) and its text runs become
   editable inline. Per-text font / style / size / bold / italic are inspector
   controls; per-bubble style is an inspector control.

UI modules are thin — they translate user input into intents and render the
output of `core/`. **No domain logic in components.**

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
5. **Per-page library migration** — the current `TypesetterStore.TextBlock`
   carries a single text + global font/style. Move to `Page → Block → TextRun[]`
   with per-run `fontId` / `styleId` and a per-page library of fonts /
   styles / bubbles (§ 2). Until then, treat the global active font/style as
   an implicit one-entry library.
6. **Shared canvas shell** — the four workspaces still each own their canvas /
   selection / pan / zoom plumbing. Extract into `src/ui/canvas/` so every
   workspace is genuinely the same shell + a different inspector + a different
   set of floating elements (§ 4, principle 5).

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
