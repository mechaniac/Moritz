/**
 * Sift — extractable opinionated UI library.
 *
 * One axis (warmth: dark cold ↔ bright warm), monochromatic surfaces with
 * low local contrast, accent colours reserved for semantics, and a
 * per-element importance system that's dev-tweakable in debug mode.
 *
 * Usage:
 *   import { SiftRoot, Workbench, FloatingWindow, Tree, ... } from './sift';
 *
 *   <SiftRoot>
 *     <Workbench
 *       stage={<MyCanvas />}
 *       windows={[
 *         <FloatingWindow id="outliner" title="Scene"><Tree ... /></FloatingWindow>,
 *         <FloatingWindow id="attrs"    title="Attributes"><Attrs>...</Attrs></FloatingWindow>,
 *       ]}
 *       overlays={<ImportanceDebugLayer />}
 *     />
 *   </SiftRoot>
 *
 * Toggle debug mode with Ctrl+Shift+D. Right-click any `<Imp id="...">`
 * element to set its importance.
 */

export { SiftRoot, ClosenessGroup, Imp, useSift, useSiftLayout, useImportance } from './SiftRoot.js';
export { Workbench } from './Workbench.js';
export { FloatingWindow } from './FloatingWindow.js';
export type { DockSpec, FloatingWindowProps } from './FloatingWindow.js';
export { Tree, type TreeNode } from './Tree.js';
export { Attrs, AttrSection, AttrRow } from './Attrs.js';
export {
  Button,
  TextInput,
  NumberInput,
  Slider,
  Checkbox,
  Select,
  type Tone,
  type Variant,
} from './inputs.js';
export { DevSettingsWindow, ImportanceDebugLayer } from './DevSettings.js';
export { buildTokens, DEFAULT_THEME, type SiftTheme } from './tokens.js';
export {
  DEFAULT_LAYOUT,
  dockToolbar,
  dockOutliner,
  dockAttrs,
  dockItemAttrs,
  type SiftLayout,
} from './layout.js';

import './sift.css';
