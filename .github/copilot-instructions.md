# Moritz — Copilot Instructions

Moritz is a **font, bubble and page generator** for comic-book lettering: a web app
that lets the user design every layer — individual glyphs, the typeface-wide style,
speech-bubble shapes, and the final page — separately and immediately, then export
the result as SVG or transparent PNG.

These instructions are the source of truth for how the codebase is structured and how
new code must be written. Keep them in sync with `CLAUDE.md` (they should stay
near-identical).

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

// ---- Page hierarchy ------------------------------------------------------

type TextRun = {
  id: string;
  text: string;
  fontId: string;             // one of the fonts loaded in the page library
  styleId: string;            // one of the styles loaded in the page library
  // Per-run modulations on top of the referenced style (bold / italic etc.)
  // stay parameter modulations — not separate cuts.
  boldFactor?: number;        // multiplier on stroke width, default 1
  slantDelta?: number;        // radians added to style.slant, default 0
  fontSize: number;           // in page units (px)
  align?: 'left' | 'center' | 'right';
};

type Block = {
  id: string;
  x: number; y: number;       // page-pixel position of the block frame
  w: number; h: number;       // block frame size
  bubble?: {
    bubbleId: string;         // one of the bubbles in the page library
    styleId: string;          // bubble's own style reference
    // Per-instance overrides (clone-on-edit) live here when the user has
    // started editing this bubble in place.
    override?: Bubble;
  };
  texts: TextRun[];           // 1+ text runs sharing the bubble's interior
};

type Page = {
  id: string;
  w: number; h: number;       // page size in px
  background?: string;        // optional reference image (data URL)
  blocks: Block[];
  // Per-page library: which fonts / styles / bubbles are available to its
  // blocks. Switching the active library entry updates every block that
  // references it. Anything not in the library cannot be referenced.
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

All workspaces share **the same canvas shell**: an infinite pannable / zoomable
vector space, the same selection model, the same handle visuals
(`StrokeOverlay`), the same export pipeline. They differ only in which floating
elements are placed, which inspector panels appear, and which grid / guides are
drawn. New shared behaviour belongs in `src/ui/canvas/` (the shell) or
`src/core/` (pure logic), **not** copy-pasted into a workspace. Any divergence
between workspaces is a bug to be removed.

Four top-level modules under `src/modules/`:

1. **glyphsetter/** — floating elements: every glyph in the active font, laid
   out as a grid for browsing; selection enters Illustrator-style spline
   editing on that glyph (add/remove strokes, add/remove anchors, drag points
   and tangent handles). Reducers are pure; the editor only emits intents
   (`ADD_ANCHOR`, `MOVE_HANDLE`, …).
2. **stylesetter/** — floating elements: a live alphabet preview rendered with
   the active style. Inspector: sliders + numeric inputs bound to
   `StyleSettings`; save/load named styles.
3. **bubblesetter/** — floating elements: every bubble in the active bubble
   library; selection enters in-place layer + spline editing on that bubble.
4. **typesetter/** — floating elements: the page background and every block.
   Selecting a block reveals its bubble's spline handles in place (same
   `StrokeOverlay` as the GlyphSetter / BubbleSetter) and its text runs become
   editable inline. Per-text font / style / size / bold / italic are inspector
   controls; per-bubble style is an inspector control.

UI modules are thin — they translate user input into intents and render the
output of `core/`. **No domain logic in components.**

### Interface system

Moritz UI is built on the extractable `src/sift/` interface library. New shared
interface work belongs there first, then Moritz-specific components compose it.

1. **One visual axis.** The interface is almost monochromatic: a cold/dark night
   end and a warm/bright day end, never pure black or pure white except at
   deliberate extremes.
2. **Low local contrast.** Nearby visible parts should be close in colour and
   value. Use Sift tokens, `ClosenessGroup`, and Sift inputs so slider tracks,
   knobs, checkboxes, ticks, labels, panels, and controls stay in the same
   contrast family.
3. **Semantic colour only.** Colour communicates function, not decoration:
   green = generate/start, yellow = annotation/help, orange = current
   relevance, red = changed/save/overwrite/destructive. Changed controls change
   themselves; do not add unrelated red outlines.
4. **Floating workbench.** The app is fullscreen. Main UI lives in dockable
   floating windows: toolbar/top, outliner/left, attributes/right. Windows have
   sensible locked positions, can be unpinned, and can snap back.
5. **Outliner + attributes everywhere.** Every workspace exposes its scene or
   artefact hierarchy through the Sift `Tree` and its selected-node properties
   through `Attrs`. TypeSetter's page hierarchy is the target model for the rest
   of the app.
6. **Importance is a first-class state.** Important, selected, or active things
   become bigger, brighter, heavier, or higher contrast through Sift importance
   levels. In debug mode, right-click Sift importance targets to tune them.
7. **Debug visibility.** Debug mode should reveal controls and relationships,
   including selected elements and children. Future node overlays and connection
   splines should be Sift/Moritz shell features, not one-off module drawings.
8. **No Tailwind.** The UI is opinionated CSS with meaningful class names
   (`sf-*` for extractable Sift pieces, `mz-*` for Moritz-specific composition).

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

## 8. Definition of done for any change

- [ ] Types in `core/types.ts` updated if the domain changed.
- [ ] Pure functions touched have/keep Vitest tests.
- [ ] No new lint or `tsc --noEmit` errors.
- [ ] Realtime preview still updates within one frame on the default font.
- [ ] If rendering changed: SVG snapshot tests reviewed and updated intentionally.
- [ ] `copilot-instructions.md` and `CLAUDE.md` updated together when conventions
      change.
