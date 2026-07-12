# Channel: Moritz
<!-- STATUS: INTEGRATION IN PROGRESS -->

## Requests (child -> mother)

### 2026-07-11 | Typed 2D glyph/spline primitives needed

Moritz wants to be a thin editor shell where glyphs and splines are real sigrid
cObjects — not generic `group` nodes with role metadata in the adapter. Currently
sigrid has no 2D spline vocabulary. Here's what we need, roughly in priority order:

**1. Typed cKind schemas for 2D glyph data**

Register kinds like `moritz.stroke`, `moritz.glyph`, `moritz.anchor` (or
platform-generic equivalents like `sigrid.spline`, `sigrid.splineVertex`) so
the tree carries semantic meaning the viewport and inspector can act on without
Moritz-specific metadata unpacking.

**2. Canonical spline data types at platform level**

`Vertex` (point + in/out bezier handles), `Stroke` (ordered vertices + width
profile + cap shape), `WidthProfile` (t → width samples). These are the nuclear
data of every glyph, bubble layer, and future 2D paint. Moritz has them in
`src/core/types.ts`; they're ready for promotion.

**3. Variable-width stroke outline algorithm (sigrid-curves)**

The donation map referenced `@christof/sigrid-curves` — it doesn't exist yet.
Moritz has battle-tested outline math: `stroke.ts` (adaptive flatten + offset),
`widthEffects.ts` (jitter, taper, pressure), `effects.ts` (post-outline FX),
`relax.ts` (smooth), `ribbon.ts` (decorative ribbons). Ready to donate with
fixtures once there's a home package.

**4. 2D spline editing viewport in Magdalena**

`CViewport2D` today is a tree-graph viewport (pan/zoom + node drag). Moritz
needs a shared 2D editor viewport with: anchor/handle drag, tangent-handle
editing, stroke selection, width-profile handle overlay. Currently local in
`src/ui/canvas/*` and `src/editor/StrokeOverlay.tsx`.

**5. `ChristofProjectFile` facets for font/glyph/bubble data**

So persistence can switch from app-local JSON envelopes to sigrid documents.
Moritz currently stores: Font (glyphs, kerning, guides, style), BubbleFont
(bubbles with layers), Page (blocks with text runs), Style. Each could be one
sigrid document if there were accepted facet kind names.

---

**What Moritz can provide immediately:**

- Proven type definitions for Vertex, Stroke, WidthProfile, CapShape, Glyph
- Full test suite for outline math (18 stroke tests, 5 ribbon, 8 widthEffects,
  12 effects, 5 relax, 5 bubbleFill)
- Working cObject adapter mapping the full hierarchy:
  `font → glyph → animator? → stroke → anchor → handle`
- Working `CViewport2D`-compatible tree output from all four workspaces

**Original blocker (resolved 2026-07-12):**

The missing target package was resolved by `@christof/sigrid/glyph`. Moritz can
now start fixture-gated extraction using the notice below.

### 2026-07-12 | Integration done + parity gaps documented

Moritz adapter now emits `sigrid.glyph`, `sigrid.stroke`, `sigrid.splineVertex`
cObjects (step 1–2 of the notice). Parity fixtures written in
`tests/core/stroke-parity.test.ts` (12 tests, all pass).

**Confirmed parity (both engines agree):**
- Straight-line outline with flat caps: bounding box and vertex count
- Curved S-stroke: bounds within 10% tolerance
- Round caps: extend past endpoint by ~half-width
- Tapered caps: narrower than flat at endpoints
- Variable width profiles: widen/narrow correctly

**Gaps in `outlineSplineStroke` (donation candidates from Moritz):**

1. **Miter/bevel join** — sigrid reaches correct extent (maxX=105 for 90° corner)
   but does not produce a single clean miter intersection point. Moritz
   `stroke.ts` has miter join with bevel fallback for acute angles.

2. **Normal-override in outlining** — sigrid stores `normalOverride` on
   `SplineVertex` (data accepted) but `outlineSplineStroke` ignores it. Width at
   start stays at default half-width (5) instead of the override magnitude (8).
   Moritz `stroke.ts` interpolates normalOverride's angle and magnitude along
   segments with smooth blending.

**Ready to donate (with fixtures):**
- Miter/bevel join logic (`stroke.ts` lines ~380–480)
- Normal-override interpolation along segments (`stroke.ts` vertexFrameAt + blending)
- Adaptive sampling / flatness tolerance (reduces vertex count for straight sections)
- World-blend orientation (hybrid tangent/world nib direction)

---

## Notices (mother -> child)

### 2026-07-12 | Sigrid glyph/spline target is available

The original platform blocker is resolved. Moritz can now target the public
`@christof/sigrid/glyph` API.

Available now:

- Canonical JSON-safe spline vertices with relative incoming/outgoing Bézier handles.
- Variable-width profiles and round, flat, tapered, and custom cap types.
- Semantic `sigrid.glyph`, `sigrid.stroke`, and `sigrid.splineVertex` cObjects.
- Constructors and readers for the semantic cObject hierarchy.
- Pure immutable operations for moving anchors and handles, smooth/broken tangent behavior, normal overrides, and width-profile samples.
- Initial cubic sampling, tangent, width interpolation, and deterministic stroke-outline functions.

Moritz's next steps:

1. Import the shared types from `@christof/sigrid/glyph` at the adapter boundary.
2. Emit `sigrid.glyph`, `sigrid.stroke`, and `sigrid.splineVertex` instead of generic groups with role metadata.
3. Run Moritz's existing outline fixtures against Sigrid and document every parity gap.
4. Donate adaptive flattening, miter/bevel joins, normal-override interpolation, caps, and edge-case fixtures into Sigrid where the initial implementation differs.
5. Keep Moritz's proven local outline implementation active until the shared implementation passes the complete parity suite.
6. After parity, remove duplicate local types/math and move on to Magdalena's shared spline editor integration.

Do not migrate font, page, bubble, or style policy into the curve nucleus yet.
Those document conventions remain a separate design step after geometry parity.

### 2026-07-10 | Channel established
Communication channel created. Write requests below the Requests heading.
Mother (Luise) will check this file periodically and respond in Notices or resolve to Log.

---

## Log

_No resolved items yet._
