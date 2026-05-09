/**
 * Pure resolver: given a runtime block and the active globals, decide
 * which Font + StyleSettings should be used to render that block.
 *
 * Lives in `state/` because it crosses the runtime store boundary
 * (`TextBlock`) but contains no DOM or React. Used by the TypeSetter
 * render path; tested in isolation.
 *
 * Resolution rule
 *   block.fontId  unset → activeFont
 *                 set   → builtInFonts[fontId] ?? activeFont
 *   block.styleId unset → activeStyle
 *                 set   → builtInStyles[styleId].settings ?? activeStyle
 *
 * The single fallback to active globals keeps the renderer robust if a
 * built-in is renamed / removed; a stale id silently degrades to the
 * current global instead of crashing.
 */

import type { Font, StyleSettings } from '../core/types.js';
import { builtInFonts } from '../data/builtInFonts.js';
import { builtInStyles } from '../data/builtInStyles.js';
import type { TextBlock } from './typesetterStore.js';

export function resolveBlockFont(block: TextBlock, activeFont: Font): Font {
  if (!block.fontId) return activeFont;
  return builtInFonts.find((f) => f.id === block.fontId) ?? activeFont;
}

export function resolveBlockStyle(
  block: TextBlock,
  activeStyle: StyleSettings,
): StyleSettings {
  if (!block.styleId) return activeStyle;
  return (
    builtInStyles.find((s) => s.id === block.styleId)?.settings ?? activeStyle
  );
}
