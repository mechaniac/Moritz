# Magdalena Integration Notes For Moritz

This note summarizes the inspection of:

```text
C:\WORK\Christof\Luise
```

with focus on:

```text
packages/magdalena
```

The goal is to evaluate whether Moritz can use Magdalena as its shared
interface package, replacing or absorbing the current local `src/sift` layer.

---

## Short Verdict

Magdalena is a strong conceptual fit for Moritz.

It already covers most of the interface principles Moritz wants:

- fullscreen workbench
- floating/dockable windows
- outliner
- attributes/dev panels
- day/night cycle
- local/global contrast controls
- importance-driven UI
- semantic color
- debug inspection
- low-clutter editor layout

The main issue is not product direction. The main issue is package readiness and
API coverage.

Moritz should adopt Magdalena eventually, but not as a blind drop-in today.
Magdalena needs a small hardening pass first, and Moritz needs a thin adapter
layer during migration.

---

## What We Like

### Visual Direction

Magdalena’s visual philosophy is very close to Moritz’s desired interface:

- almost monochromatic
- soft, dark, quiet material
- low local contrast
- no decorative color
- color reserved for function
- active/important elements becoming more prominent
- selected/descendant state clearly visible
- fullscreen app surface with floating tools

This matches Moritz much better than a generic UI kit would.

### Theme Model

Magdalena’s theme model is stronger than Moritz’s current Sift implementation.

Especially useful:

- separate `globalContrast` and `localContrast`
- day/night cycle
- temperature shift
- saturation
- softness
- density
- motion
- closeness settings for different relationships

This is exactly the kind of live-tunable interface system Moritz wants.

### Importance Recipes

Magdalena’s `MgImportanceRecipe` is a major win.

It lets importance affect:

- scale
- height
- padding
- font size
- font weight
- contrast
- brightness
- opacity
- motion
- tone mix

Moritz needs this. The idea that importance is not just a class name, but a
dynamic recipe, is the right abstraction.

### Outliner

`MgOutliner` already supports useful editor behavior:

- collapsible hierarchy
- selected state
- selected-descendant state
- hidden state
- node colors
- importance
- minimal zoom mode
- pill/dot visual language

Moritz needs outliners for:

- font → glyphs → strokes
- bubble font → bubbles → layers
- page → blocks → texts/bubbles
- project → pages/assets/libraries

Magdalena’s outliner is a good base for all of those.

### Floating Windows

`MgFloatingWindow` has the right model:

- docked/pinned by default
- free-floating when dragged
- snap back to dock
- persisted window state
- preset docks

This aligns directly with Moritz’s desired workbench behavior.

### Dev Settings

`MgDevSettings` already exposes the kind of controls Moritz wants for tuning:

- theme
- contrast
- local contrast
- saturation
- temperature
- softness
- density
- motion
- outliner zoom
- closeness
- importance recipes
- debug/inspection

Moritz’s interface design depends on this sort of live adjustment.

---

## Compatibility Findings

### Package Shape

Magdalena is currently a workspace package:

```json
{
  "name": "@christof/magdalena",
  "private": true,
  "version": "0.1.0",
  "type": "module"
}
```

Its exports currently point to source files:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./styles.css": "./src/styles/magdalena.css"
  }
}
```

This works for local workspace development, but is not yet ideal for Moritz as
a separate consumer.

Moritz would prefer compiled package output:

```text
dist/
  index.js
  index.d.ts
  styles.css
```

with exports pointing to `dist`.

### React Version

Magdalena declares:

```json
"peerDependencies": {
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}
```

Moritz currently uses:

```json
"react": "^18.3.1",
"react-dom": "^18.3.1"
```

From inspection, Magdalena’s React code appears to use standard APIs:

- `createContext`
- `useContext`
- `useEffect`
- `useLayoutEffect`
- `useMemo`
- `useRef`
- `useState`
- React event/types

No React 19-only runtime API stood out.

Suggestion:

```json
"peerDependencies": {
  "react": ">=18 <20",
  "react-dom": ">=18 <20"
}
```

unless React 19 is a deliberate hard requirement.

### Tooling Versions

Luise/Magdalena uses newer tooling:

- React 19
- TypeScript 5.9
- Vite 7
- Vitest 4

Moritz currently uses:

- React 18
- TypeScript 5.6
- Vite 5
- Vitest 2

This is manageable if Magdalena publishes compiled JS and `.d.ts` files. It is
more fragile if Moritz imports Magdalena source directly.

### CSS

Magdalena exposes:

```ts
import "@christof/magdalena/styles.css";
```

This is good, but the requirement should be documented clearly. Moritz should
not have to discover the CSS import by reading the package internals.

### Runtime Storage

`MagdalenaProvider` currently uses:

```ts
const STORAGE_KEY = "magdalena.settings.v1";
```

Moritz needs a configurable storage namespace so multiple apps can use
Magdalena without localStorage collisions.

Suggested provider API:

```tsx
<MagdalenaProvider storageKey="moritz.magdalena.settings.v1">
  ...
</MagdalenaProvider>
```

or:

```tsx
<MagdalenaProvider appId="moritz">
  ...
</MagdalenaProvider>
```

### Current Health

Magdalena checks passed during inspection:

```bash
npm.cmd --workspace @christof/magdalena run typecheck
npm.cmd --workspace @christof/magdalena run test
```

Result:

```text
typecheck passed
2 test files passed
8 tests passed
```

---

## What Moritz Needs

### Package Hardening

Before Moritz depends on Magdalena directly, we need:

1. `private: false` when ready for package consumption.
2. A build script for Magdalena.
3. Compiled `dist` output.
4. Exported `.d.ts` types.
5. CSS copied/exported from `dist`.
6. React peer dependency widened to React 18 if possible.
7. A documented install/import path.
8. A documented CSS import.

Recommended package shape:

```json
{
  "name": "@christof/magdalena",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./dist/styles.css"
  },
  "peerDependencies": {
    "react": ">=18 <20",
    "react-dom": ">=18 <20"
  }
}
```

### Provider Configuration

Moritz needs `MagdalenaProvider` to accept configuration:

```tsx
<MagdalenaProvider
  appId="moritz"
  storageKey="moritz.magdalena.settings.v1"
  initialSettings={...}
>
  ...
</MagdalenaProvider>
```

Useful provider options:

- `appId`
- `storageKey`
- `initialSettings`
- `persist?: boolean`
- `onSettingsChange?`
- `debugDefault?`

### More Generic Dock Configuration

`mgDock` presets are useful, but Moritz will need more control.

Current presets:

- toolbar
- outliner
- attributes
- instance
- dev

Moritz needs:

- global toolbar
- left outliner
- right attributes
- item attributes
- page/block HUD
- module-specific tool windows
- potentially bottom/timeline/export panels later

Suggestion:

Keep presets, but also expose a documented way to define app-specific dock
recipes.

### Attribute Inspector Primitives

Moritz currently needs something like:

```tsx
<MgAttrs>
  <MgAttrSection title="Glyph">
    <MgAttrRow label="Width">
      <MgNumberInput ... />
    </MgAttrRow>
  </MgAttrSection>
</MgAttrs>
```

Magdalena has controls, but not yet a dedicated generic inspector layout.

Needed:

- `MgAttrs`
- `MgAttrSection`
- `MgAttrRow`
- consistent label/control layout
- changed-state styling
- importance per row/section
- tone per row/section
- compact and debug-expanded modes

### More Controls

Current controls are a good base:

- `MgButton`
- `MgSlider`
- `MgToggle`
- `MgTextInput`

Moritz also needs:

- `MgNumberInput`
- `MgSelect`
- `MgTextarea`
- `MgSegmentedControl`
- `MgIconButton`
- `MgSwatch`
- `MgStepper`
- `MgFileButton`
- possibly `MgVector2Input`
- possibly `MgAngleInput`

### Richer Outliner Node Shape

Current `MgTreeNode` is useful:

```ts
interface MgTreeNode {
  id: string;
  label: string;
  children?: MgTreeNode[];
  collapsed?: boolean;
  selected?: boolean;
  activeDescendant?: boolean;
  hidden?: boolean;
  tone?: MgTone;
  importance?: MgImportance;
  color?: string;
  position?: readonly [number, number, number];
}
```

Moritz would benefit from:

- `kind`
- `icon`
- `hint`
- `badge`
- `changed`
- `locked`
- `visible`
- `selectable`
- `actions`
- `position2d`
- optional richer label rendering, or a structured label model

The outliner should stay generic, but it needs enough metadata to represent
font/page/bubble structures without custom forks.

### 2D / Vector Editor Support

Luise pressures Magdalena as a 3D app. Moritz will pressure it as a 2D vector
and page editor.

Moritz needs a first-class story for:

- SVG/canvas stage
- page space
- vector space
- pan/zoom camera
- overlay handles
- selected object overlays
- parent/child connection curves
- optional grid/guides

This does not need to be a rendering engine. Magdalena can stay UI-focused, but
it should provide viewport shell primitives that do not assume 3D.

### Relationship Overlays

Moritz wants selected-node child overlays and connection splines.

Magdalena already has `position` on `MgTreeNode`, which is a good start. The
next step could be a generic overlay primitive:

```tsx
<MgRelationshipOverlay
  nodes={treeNodes}
  selectedId={selectedId}
  projectPosition={...}
/>
```

For Moritz this would draw:

- page block to text runs
- bubble to layers
- glyph to strokes
- selected element to children

For Luise this would draw:

- selected transform node to child nodes
- hierarchy splines in 3D/overlay space

---

## Suggested Migration Path For Moritz

Moritz should avoid running `src/sift` and Magdalena side-by-side for long.

Recommended path:

1. Harden Magdalena package output.
2. Widen React peer dependency if possible.
3. Add provider namespace/configuration.
4. Add inspector primitives and missing controls.
5. In Moritz, create a small adapter layer:

```text
src/interface/
  magdalena.tsx
  moritzTreeAdapters.ts
  moritzDock.ts
```

6. Replace Moritz `SiftRoot` with `MagdalenaProvider`.
7. Replace Sift workbench/windows with Magdalena workbench/windows.
8. Replace Sift outliners with `MgOutliner`.
9. Replace Sift attributes with Magdalena inspector primitives.
10. Replace Sift controls with Magdalena controls.
11. Delete `src/sift`.

During migration, Moritz should keep a narrow compatibility layer so module code
does not directly depend on every Magdalena detail.

---

## Suggested Adapter Shapes

### Font To Magdalena Tree

```ts
function moritzFontToMgTree(font, selectedGlyphId): MgTreeNode[] {
  return [
    {
      id: `font:${font.id}`,
      label: font.name,
      importance: 2,
      children: Object.entries(font.glyphs).map(([char, glyph]) => ({
        id: `glyph:${char}`,
        label: char === " " ? "space" : char,
        importance: char === selectedGlyphId ? 5 : 1,
        tone: char === selectedGlyphId ? "relevant" : "neutral",
        children: glyph.strokes.map((stroke, index) => ({
          id: `glyph:${char}:stroke:${stroke.id}`,
          label: `Stroke ${index + 1}`,
          importance: 1,
        })),
      })),
    },
  ];
}
```

### Bubble Font To Magdalena Tree

```ts
function moritzBubbleFontToMgTree(bubbleFont, selectedBubbleId, selectedLayerId): MgTreeNode[] {
  return [
    {
      id: `bubbleFont:${bubbleFont.id}`,
      label: bubbleFont.name,
      importance: 2,
      children: Object.values(bubbleFont.bubbles).map((bubble) => ({
        id: `bubble:${bubble.id}`,
        label: bubble.name,
        importance: bubble.id === selectedBubbleId ? 5 : 1,
        tone: bubble.id === selectedBubbleId ? "relevant" : "neutral",
        children: bubble.layers.map((layer) => ({
          id: `bubble:${bubble.id}:layer:${layer.id}`,
          label: layer.name,
          importance: layer.id === selectedLayerId ? 5 : 1,
          tone: layer.id === selectedLayerId ? "relevant" : "neutral",
        })),
      })),
    },
  ];
}
```

### Page To Magdalena Tree

```ts
function moritzPageToMgTree(page, selectedBlockId): MgTreeNode[] {
  return [
    {
      id: `page:${page.id}`,
      label: page.name,
      importance: 2,
      children: page.blocks.map((block, index) => ({
        id: `block:${block.id}`,
        label: `Block ${index + 1}`,
        importance: block.id === selectedBlockId ? 5 : 1,
        tone: block.id === selectedBlockId ? "relevant" : "neutral",
        children: [
          ...(block.bubble ? [{ id: `block:${block.id}:bubble`, label: "Bubble" }] : []),
          ...block.texts.map((text, textIndex) => ({
            id: `block:${block.id}:text:${text.id}`,
            label: `Text ${textIndex + 1}`,
          })),
        ],
      })),
    },
  ];
}
```

---

## Questions For Magdalena

1. Should Magdalena officially support React 18?
2. Should Magdalena publish compiled `dist`, or stay source-only inside a
   workspace for now?
3. Should app-specific settings persistence be configured by `appId` or
   `storageKey`?
4. Should attributes/inspector primitives live in Magdalena, or should each app
   build them locally?
5. Should `MgTreeNode` stay string-label-only, or support structured metadata?
6. Should Magdalena include viewport overlay primitives, or only UI chrome?
7. Should Sift be retired in Moritz once Magdalena reaches parity?

---

## Bottom Line

Magdalena is the right direction.

For Moritz, it can become the shared interface foundation if it gets:

- package hardening
- React 18 compatibility
- provider configuration
- generic inspector primitives
- richer controls
- richer outliner metadata
- 2D/vector editor support

Moritz should not invest much more in a separate Sift system if Magdalena is
going to become the canonical interface package. The best path is to harden
Magdalena and migrate Moritz onto it through a thin compatibility adapter.
