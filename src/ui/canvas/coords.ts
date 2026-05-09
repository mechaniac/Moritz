/**
 * Shared canvas shell — coordinate helpers.
 *
 * Every workspace converts client (screen) pixels to its inner SVG
 * coordinate system the same way: `getScreenCTM().inverse()` on the
 * SVG, then `matrixTransform` on a `SVGPoint`. Centralised here so
 * future shared canvas code (and the workspaces themselves) all go
 * through one implementation.
 */

import type { Vec2 } from '../../core/types.js';

/**
 * Convert client (viewport) pixels to the SVG's internal coordinate
 * system (the one its viewBox is expressed in). Returns `null` when
 * the SVG has no current transform matrix (e.g. detached from the
 * DOM).
 */
export function screenToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Vec2 | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(inv);
  return { x: local.x, y: local.y };
}
