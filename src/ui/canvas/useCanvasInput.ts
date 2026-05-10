/**
 * Shared canvas shell — input plumbing.
 *
 * Every Moritz workspace (GlyphSetter, BubbleSetter, StyleSetter,
 * TypeSetter) is meant to be an endless pan/zoomable vector space
 * (see principle 5 in `.github/copilot-instructions.md`). This hook
 * owns the *input* half of that shell: it binds wheel-zoom, two-finger
 * pinch-zoom and (optionally) space-bar / middle-mouse panning to a
 * target SVG (or HTML) element, and tracks the `spaceDown` flag so
 * the host can toggle a "grab" cursor.
 *
 * The camera state itself lives wherever the caller wants — Zustand
 * store, local React state, anywhere — and is read/written through
 * `getCamera` / `setCamera`. That keeps the hook agnostic of the
 * workspace's persistence strategy.
 *
 * The *visual* half of the shell (viewBox math, marquee, world-to-
 * screen transform) stays in the workspace for now and will move
 * here in a later step (`<Workspace>` component).
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Camera snapshot. `panX` / `panY` are screen-pixel offsets of the
 * world origin from the canvas centre. `zoom` is screen px per world
 * unit.
 */
export type CameraSnapshot = {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
};

export type CanvasInputConfig = {
  /** ALWAYS returns the latest snapshot. Do not capture in closures. */
  getCamera: () => CameraSnapshot;
  /** Patch — only changed fields need to be set. */
  setCamera: (patch: Partial<CameraSnapshot>) => void;
  readonly minZoom: number;
  readonly maxZoom: number;
  /**
   * Which gestures start a pan drag.
   *  - 'space'  — only space-bar + left-mouse
   *  - 'middle' — only middle-mouse
   *  - 'both'   — either (default)
   *  - 'none'   — disable panning entirely (e.g. fixed-page workspaces)
   */
  readonly pan?: 'space' | 'middle' | 'both' | 'none';
};

/** Pure helper: clamp `zoom` to `[min, max]`. Exported for tests. */
export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, zoom));
}

/**
 * Pure helper: wheel-delta → zoom multiplier. Exponential so a
 * constant wheel speed feels like a constant zoom *rate* (additive
 * in log-space). Sign matches browser convention: scrolling down
 * (positive deltaY) zooms out.
 */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

/**
 * Bind wheel + pinch + (optionally) space/middle-mouse pan to
 * `targetRef`. Returns the current `spaceDown` flag.
 *
 * The hook is a pure side-effect; the host renders the canvas
 * however it likes. Pan drags use pointer-capture so they work even
 * when the cursor leaves the element.
 */
export function useCanvasInput(
  targetRef: React.RefObject<SVGSVGElement | HTMLElement | null>,
  config: CanvasInputConfig,
): { readonly spaceDown: boolean } {
  // Always-fresh refs so the listeners (bound once) read live values.
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const [spaceDown, setSpaceDown] = useState(false);

  // ---- Space-bar tracking -------------------------------------------------
  // Window-level so the user can press space while the cursor is over
  // the canvas without having to focus it first.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      // Don't hijack space when the user is typing.
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setSpaceDown(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ---- Wheel + pinch ------------------------------------------------------
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    // Cast through `EventTarget` once so we get unambiguous overloads
    // for `addEventListener` (the union `SVGSVGElement | HTMLElement`
    // widens TS's signature picker to the generic Event variant).
    const target: EventTarget = el;

    /**
     * Cursor-anchored zoom. Keeps the world point under (clientX, clientY)
     * fixed on screen while the zoom changes. Convention:
     *   world = (screen - pan) / zoom
     * Solving (s - p) / z = (s - p') / z'  →  p' = s - (s - p) * z'/z.
     * So we shift pan by `(s - p) * (1 - z'/z)`. Falls back to plain
     * zoom if the camera has no pan (panX/Y are missing or both 0 and the
     * caller's setter ignores them).
     */
    const applyAt = (nextZoom: number, sx: number, sy: number): void => {
      const cam = cfgRef.current.getCamera();
      const cur = cam.zoom;
      const next = clampZoom(nextZoom, cfgRef.current.minZoom, cfgRef.current.maxZoom);
      if (next === cur) return;
      const k = next / cur;
      const px = cam.panX ?? 0;
      const py = cam.panY ?? 0;
      cfgRef.current.setCamera({
        zoom: next,
        panX: sx - (sx - px) * k,
        panY: sy - (sy - py) * k,
      });
    };

    const onWheel = (e: Event): void => {
      const w = e as WheelEvent;
      w.preventDefault();
      const rect = (el as Element).getBoundingClientRect();
      const sx = w.clientX - rect.left;
      const sy = w.clientY - rect.top;
      applyAt(
        cfgRef.current.getCamera().zoom * wheelZoomFactor(w.deltaY),
        sx,
        sy,
      );
    };
    target.addEventListener('wheel', onWheel, { passive: false });

    // Pinch (touchscreen): track active pointers; while exactly two
    // are down, scale by the ratio of current vs. initial finger
    // distance.
    const pts = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startZoom = 0;
    const dist = (): number => {
      const arr = Array.from(pts.values());
      if (arr.length < 2) return 0;
      const dx = arr[0]!.x - arr[1]!.x;
      const dy = arr[0]!.y - arr[1]!.y;
      return Math.hypot(dx, dy);
    };
    const onPDown = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.pointerType !== 'touch') return;
      pts.set(p.pointerId, { x: p.clientX, y: p.clientY });
      if (pts.size === 2) {
        startDist = dist();
        startZoom = cfgRef.current.getCamera().zoom;
      }
    };
    const onPMove = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.pointerType !== 'touch') return;
      if (!pts.has(p.pointerId)) return;
      pts.set(p.pointerId, { x: p.clientX, y: p.clientY });
      if (pts.size >= 2 && startDist > 0) {
        p.preventDefault();
        const arr = Array.from(pts.values());
        const rect = (el as Element).getBoundingClientRect();
        const mx = (arr[0]!.x + arr[1]!.x) / 2 - rect.left;
        const my = (arr[0]!.y + arr[1]!.y) / 2 - rect.top;
        applyAt(startZoom * (dist() / startDist), mx, my);
      }
    };
    const onPEnd = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.pointerType !== 'touch') return;
      pts.delete(p.pointerId);
      if (pts.size < 2) startDist = 0;
    };
    target.addEventListener('pointerdown', onPDown);
    target.addEventListener('pointermove', onPMove, { passive: false });
    target.addEventListener('pointerup', onPEnd);
    target.addEventListener('pointercancel', onPEnd);
    target.addEventListener('pointerleave', onPEnd);

    return () => {
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('pointerdown', onPDown);
      target.removeEventListener('pointermove', onPMove);
      target.removeEventListener('pointerup', onPEnd);
      target.removeEventListener('pointercancel', onPEnd);
      target.removeEventListener('pointerleave', onPEnd);
    };
  }, [targetRef]);

  return { spaceDown };
}

/**
 * Pan-drag helpers. Workspaces own their own pointer-event routing
 * (because the same handler handles selection, marquee, etc.), so
 * we expose `panMode(button, spaceDown, mode)` and a tiny
 * `panDelta(start, current)` rather than wiring the listeners
 * ourselves. Keeps the hook composable.
 */
export function isPanGesture(
  button: number,
  spaceDown: boolean,
  mode: 'space' | 'middle' | 'both' | 'none' = 'both',
): boolean {
  if (mode === 'none') return false;
  if (mode === 'middle') return button === 1;
  if (mode === 'space') return button === 0 && spaceDown;
  return button === 1 || (button === 0 && spaceDown);
}
