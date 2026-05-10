/**
 * Sift layout knobs — a single source of truth for the docked positions
 * of the toolbar / outliner / attributes windows across every workspace.
 *
 * All values are in CSS px and are derived from a small set of base
 * parameters so the dock layout stays internally consistent: every gap
 * is one `gap`, every viewport margin is one `pad`, the side panels are
 * the same `sideW`, and the toolbar is exactly `toolbarH` tall and as
 * wide as the viewport minus one side panel + one gap.
 *
 *   ┌──────────────────────── pad ────────────────────────┐
 *   │  ┌─────────── toolbar ───────────┐  ┌─── attrs ───┐ │
 *   │  │                               │  │             │ │
 *   │  └───────────────────────────────┘  │             │ │
 *   │  pad+toolbarH+gap                   │             │ │
 *   │  ┌─── outliner ───┐                 │             │ │
 *   │  │                │                 │             │ │
 *   │  │                │                 │             │ │
 *   │  └────────────────┘                 └─────────────┘ │
 *   └────────────────────── pad ──────────────────────────┘
 */

import type { DockSpec } from './FloatingWindow.js';

export type SiftLayout = {
  /** Margin from the viewport edges. */
  pad: number;
  /** Gap between docked windows. */
  gap: number;
  /** Height of the top toolbar window. */
  toolbarH: number;
  /** Shared width of the left/right side panels. */
  sideW: number;
};

export const DEFAULT_LAYOUT: SiftLayout = {
  pad: 8,
  gap: 8,
  toolbarH: 116,
  sideW: 280,
};

/** Top toolbar — full width minus right side panel + gap. */
export function dockToolbar(L: SiftLayout): DockSpec {
  return {
    top: L.pad,
    left: L.pad,
    right: L.pad + L.sideW + L.gap,
    height: L.toolbarH,
  };
}

/** Left outliner — under the toolbar, full remaining height. */
export function dockOutliner(L: SiftLayout): DockSpec {
  return {
    left: L.pad,
    top: L.pad + L.toolbarH + L.gap,
    bottom: L.pad,
    width: L.sideW,
  };
}

/** Right attributes panel — full viewport height. */
export function dockAttrs(L: SiftLayout): DockSpec {
  return {
    right: L.pad,
    top: L.pad,
    bottom: L.pad,
    width: L.sideW,
  };
}

/** Per-item attributes — a small floating panel docked just to the right of
 *  the outliner, near where the selected item sits in the stage. Same
 *  position across every workspace so the user always knows where to look. */
export function dockItemAttrs(L: SiftLayout): DockSpec {
  return {
    left: L.pad + L.sideW + L.gap,
    top: L.pad + L.toolbarH + L.gap,
    width: L.sideW,
    height: 320,
  };
}
