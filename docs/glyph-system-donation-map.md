# Glyph System Donation Map

Status: active
Date: 2026-05-16

## Goal

Moritz should stop owning general glyph/vector infrastructure locally. The
target is not to remove capability from the product; it is to move capability
to Sigrid or Magdalena and leave Moritz as a thin editor shell for authoring
fonts, bubbles, styles, and pages.

Mother update 2026-05-16: Luise now states that glyphs are platform code.
Moritz therefore treats `@christof/sigrid/glyph` as the canonical glyph
vocabulary and `@christof/sigrid-curves` as behavior layered on top of those
types.

## No-Loss Gate

A Moritz-local glyph feature can be deleted only after one of these is true:

1. Sigrid or Magdalena has an equivalent platform feature, plus a Moritz
   adoption commit that proves the same workflow still works.
2. The director explicitly rejects the donation candidate and accepts the
   visible regression described in `platform-team-wishlist.md`.

This keeps "Moritz loses ownership" separate from "the system loses behavior."
The preferred path is ownership loss only.

## Ownership Split

| Area | Owner | Moritz outcome |
|---|---|---|
| Glyph/stroke/anchor/handle identity | Sigrid (`@christof/sigrid/glyph`) | Moritz imports canonical glyph types and keeps adapters until Sigrid has typed 2D glyph cKinds. |
| Project/file identity | Sigrid | Moritz saves `SigridProjectFile`, not app-local envelopes. |
| Glyph geometry and transforms | Sigrid | Moritz imports upstream helpers. |
| Stroke outline, width, jitter, relax, ribbon, fill | Sigrid curves or Sigrid paint | Moritz deletes local render math after equivalent upstream adoption. |
| Bubble-layer vector paint | Sigrid curves or Sigrid paint | Moritz keeps bubble authoring UI, not the general paint primitive. |
| Workbench, panels, outliners, controls, viewports, gizmos | Magdalena | Moritz supplies domain payloads and handlers only. |
| Built-in fonts, presets, kerning, guides, authoring workflow | Moritz | Stays app-owned. |

## Feature Inventory

| Feature | Current Moritz files | Platform target | If accepted | If rejected |
|---|---|---|---|---|
| Glyph as universal drawable unit | `src/core/types.ts`, `src/core/moritzCObjects.ts`, `src/core/glyphAnimator.ts` | `@christof/sigrid/glyph`, then typed 2D glyph cKinds and project nodes | Moritz swaps adapter kinds from semantic `group` to typed cKinds. | Moritz keeps metadata adapter around generic cObjects. |
| Pure glyph animator | `src/core/glyphAnimator.ts` | Sigrid glyph types plus Sigrid curves animation primitives | Mostly done; Moritz imports `Glyph2d` / `GlyphSplineStroke` from `@christof/sigrid/glyph` and keeps only authoring controls. | Moritz keeps the small bridge, but animation data stays on `Glyph`. |
| Rich stroke outline | `src/core/stroke.ts`, `src/core/widthEffects.ts`, `src/core/effects.ts`, `src/core/relax.ts`, `src/core/ribbon.ts` | W4 in `@christof/sigrid-curves` | No visible loss: custom caps, adaptive flattening, width modulation, jitter, relax, and ribbons move upstream. | Moritz adopts upstream outline as-is; tight-bend smoothing, custom caps, richer jitter/width behavior, and some ribbon richness are lost or retuned. |
| Fill from open hand-drawn strokes | `src/core/bubbleFill.ts` | W5 in `@christof/sigrid-curves` | Cloud/organic fills keep working; loop chaining moves upstream. | Bubble outlines must be authored as closed strokes; organic cloud fills are rebuilt or removed. |
| Bubble-layer paint | `src/core/bubble.ts`, `src/core/bubbleRender.ts` | W6 in `@christof/sigrid-curves` or `@christof/sigrid-paint` | Multi-layer offset/fill/effect primitive moves upstream; Moritz keeps BubbleSetter workflow. | Moritz either keeps a known Rule-of-Three violation or accepts a simpler bubble model. |
| 2D viewport and overlays | `src/ui/canvas/*`, `src/editor/*` | W2/W3 in Magdalena | Pan/zoom, hit testing, anchors, handles, and overlays become shared 2D editor infrastructure. | Moritz keeps local canvas/overlay code and remains thicker than desired. |
| Persistence | `src/state/*Persistence.ts`, `src/state/persistence.ts` | W1 plus `SigridProjectFile` | Fonts/glyphs/styles/bubbles/pages live in Sigrid documents. | Moritz stores one opaque Sigrid document until facet kind names are accepted. |
| TypeSetter runtime model | `src/modules/typesetter/TypeSetter.tsx`, `src/core/page.ts` | Sigrid-compatible `Page -> Block -> TextRun` graph | cObject identity and persistence use the same canonical model. | Moritz keeps boundary adapters and carries duplicated shape logic. |

## Extraction Order

1. Lock behavior with fixtures before extraction:
   - representative glyph outline with custom caps,
   - width modulation and jitter with deterministic seed,
   - open-stroke bubble fill,
   - multi-layer bubble render,
   - glyph animator path frames.
   Current first fixture: `tests/core/glyphAnimator.test.ts` verifies the
   Moritz-to-Sigrid glyph adapter boundary.
2. For each fixture, adopt the upstream Sigrid/Magdalena equivalent first.
3. Delete the Moritz-local implementation only after the fixture passes through
   the upstream path.
4. If the platform rejects a feature, record the accepted regression and retune
   the built-in fonts or bubbles in the same slice.

## Immediate Next Slices

1. Treat new glyph imports as a rule: canonical glyph data types come from
   `@christof/sigrid/glyph`, not through `@christof/sigrid-curves`.
2. Add renderer equivalence fixtures for W4/W5/W6 candidates.
3. Convert live TypeSetter state from legacy `TextBlock` to canonical
   `Page -> Block -> TextRun`.
4. Move persistence to `SigridProjectFile` once W1 naming is accepted or the
   opaque-document fallback is chosen.
5. Replace remaining local 2D viewport/overlay pieces with Magdalena W2/W3 when
   available.
