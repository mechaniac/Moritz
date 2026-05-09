/**
 * useCanvasSize — measure a wrapper element's client size with a
 * ResizeObserver and return the live { w, h }.
 *
 * Shared canvas-shell primitive (Principle 5: one workspace, four
 * lenses). All four workspaces want an SVG that fills its parent and
 * re-measures on resize; this hook is the single source of truth for
 * that measurement so the four shells stay byte-identical.
 */

import { useLayoutEffect, useState } from 'react';

export type Size = { readonly w: number; readonly h: number };

export function useCanvasSize(
  wrapRef: React.RefObject<HTMLElement | null>,
  initial: Size = { w: 800, h: 600 },
): Size {
  const [size, setSize] = useState<Size>(initial);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef]);
  return size;
}
