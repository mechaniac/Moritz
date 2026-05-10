/**
 * Floating window — drag from the title bar, resize from the corner.
 *
 * Two modes:
 *   - **Pinned (docked).** When `dock` is provided, the window is anchored
 *     to viewport edges and stretches with window resize. This is the
 *     default for any window that declares a dock.
 *   - **Floating.** Dragging the title-bar (or clicking the pin) unpins
 *     the window; it then keeps a freely positioned bounds. Clicking the
 *     pin again re-docks.
 *
 * Position / size + pinned flag are persisted per `id` in localStorage.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from 'react';

/**
 * Anchored layout: any subset of edges + optional fixed width/height.
 * If both `left` and `right` are set the width stretches; same for
 * `top`/`bottom`. Edges in CSS px from the viewport.
 */
export type DockSpec = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  width?: number;
  height?: number;
};

export type FloatingWindowProps = {
  /** Persistent id for position/size (localStorage key). */
  id?: string;
  title?: ReactNode;
  /** Initial floating bounds. Ignored if persisted state exists. */
  initial?: { x?: number; y?: number; w?: number; h?: number };
  /** Optional default docked layout. Window starts pinned to this. */
  dock?: DockSpec;
  /** Optional minimum size. */
  minW?: number;
  minH?: number;
  resizable?: boolean;
  /** Chromeless mode: no head bar; drag from anywhere on the body. The
   *  pin button (if `dock` is set) is rendered as a tiny corner pill. */
  bare?: boolean;
  /** Module identity of the window's content. Adds `mz-mod--<mod>` to the
   *  root so the window inherits that module's `--mz-*` palette (panel /
   *  bg / accent). Used so a Style attributes window reads orange even
   *  when it floats on top of a Glyph stage. */
  mod?: string;
  className?: string;
  style?: CSSProperties;
  headerExtra?: ReactNode;
  children: ReactNode;
};

type Bounds = { x: number; y: number; w: number; h: number };
type Persisted = { pinned: boolean; bounds: Bounds };

function viewportSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Compute docked bounds from a `DockSpec` against the current viewport. */
function dockBounds(d: DockSpec, vw: number, vh: number): Bounds {
  const { left, right, top, bottom } = d;
  let x: number;
  let w: number;
  if (left !== undefined && right !== undefined) {
    x = left;
    w = Math.max(0, vw - left - right);
  } else if (left !== undefined) {
    x = left;
    w = d.width ?? 280;
  } else if (right !== undefined) {
    w = d.width ?? 280;
    x = vw - right - w;
  } else {
    w = d.width ?? 280;
    x = 24;
  }
  let y: number;
  let h: number;
  if (top !== undefined && bottom !== undefined) {
    y = top;
    h = Math.max(0, vh - top - bottom);
  } else if (top !== undefined) {
    y = top;
    h = d.height ?? 360;
  } else if (bottom !== undefined) {
    h = d.height ?? 360;
    y = vh - bottom - h;
  } else {
    h = d.height ?? 360;
    y = 24;
  }
  return { x, y, w, h };
}

export function FloatingWindow(props: FloatingWindowProps): JSX.Element {
  const init: Bounds = useMemo(
    () => ({
      x: props.initial?.x ?? 24,
      y: props.initial?.y ?? 24,
      w: props.initial?.w ?? 280,
      h: props.initial?.h ?? 360,
    }),
    [props.initial?.x, props.initial?.y, props.initial?.w, props.initial?.h],
  );

  const hasDock = !!props.dock;
  // Pin state is **ephemeral** — every reload starts at the dock position.
  // Dragging during a session can temporarily un-dock (snapshot bounds in
  // `state.bounds`), and the pin button re-docks. We deliberately do NOT
  // persist this so the layout is always opinionated and universal on
  // startup. Browser localStorage was previously used here (`sift.win.*`,
  // `sift.win.v2.*`); both keys are now ignored.
  const [state, setState] = useState<Persisted>(() => ({
    pinned: hasDock,
    bounds: init,
  }));

  // Live viewport size for docked rendering.
  const [vp, setVp] = useState(viewportSize);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setVp(viewportSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // No persistence of dock/bounds (see comment above).

  const docked = state.pinned && !!props.dock;
  const renderBounds: Bounds = docked
    ? dockBounds(props.dock as DockSpec, vp.w, vp.h)
    : state.bounds;

  const dragRef = useRef<{
    kind: 'move' | 'resize';
    sx: number;
    sy: number;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    moved: boolean;
  } | null>(null);

  const beginDrag = (
    kind: 'move' | 'resize',
    e: PointerEvent,
    b: Bounds,
  ): void => {
    dragRef.current = {
      kind,
      sx: e.clientX,
      sy: e.clientY,
      bx: b.x,
      by: b.y,
      bw: b.w,
      bh: b.h,
      moved: false,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onHeadDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    beginDrag('move', e, renderBounds);
  };
  const onResizeDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    beginDrag('resize', e, renderBounds);
  };
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !d.moved) return;
    d.moved = true;
    if (d.kind === 'move') {
      // Move-drag always unpins (snapshot current rendered bounds).
      setState({
        pinned: false,
        bounds: { x: d.bx + dx, y: d.by + dy, w: d.bw, h: d.bh },
      });
    } else {
      const minW = props.minW ?? 160;
      const minH = props.minH ?? 80;
      const w = Math.max(minW, d.bw + dx);
      const h = Math.max(minH, d.bh + dy);
      setState({ pinned: false, bounds: { x: d.bx, y: d.by, w, h } });
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const togglePin = (): void => {
    if (!props.dock) return;
    setState((s) =>
      s.pinned
        ? { pinned: false, bounds: renderBounds }
        : { pinned: true, bounds: s.bounds },
    );
  };

  const cls = [
    'sf-window',
    'sf-window--idle',
    docked ? 'sf-window--pinned' : 'sf-window--free',
    props.bare ? 'sf-window--bare' : null,
    props.mod ? `mz-mod--${props.mod}` : null,
    props.className,
  ]
    .filter(Boolean)
    .join(' ');

  const pinBtn =
    props.dock ? (
      <button
        type="button"
        className={`sf-window__pin ${state.pinned ? 'sf-window__pin--on' : ''}`}
        title={state.pinned ? 'Unpin (free float)' : 'Pin to default position'}
        onPointerDown={(ev) => ev.stopPropagation()}
        onClick={togglePin}
      >
        {state.pinned ? '◉' : '○'}
      </button>
    ) : null;

  return (
    <div
      className={cls}
      style={{
        left: renderBounds.x,
        top: renderBounds.y,
        width: renderBounds.w,
        height: renderBounds.h,
        ...(props.style ?? {}),
      }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      {...(props.bare ? { onPointerDown: onHeadDown } : {})}
    >
      {!props.bare && (
        <div className="sf-window__head" onPointerDown={onHeadDown}>
          <span className="sf-window__title">{props.title}</span>
          {props.headerExtra}
          {pinBtn}
        </div>
      )}
      {props.bare && pinBtn && (
        <div className="sf-window__bare-handle">{pinBtn}</div>
      )}
      <div className="sf-window__body">{props.children}</div>
      {props.resizable !== false && !docked && (
        <div className="sf-window__resize" onPointerDown={onResizeDown} />
      )}
    </div>
  );
}
