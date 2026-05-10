/**
 * Sift root provider. Wrap the app in <SiftRoot> (or scope a section by
 * placing one anywhere) and it injects token CSS variables onto its DOM
 * node. Children get the design system "for free".
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { buildTokens, DEFAULT_THEME, type SiftTheme } from './tokens.js';
import { DEFAULT_LAYOUT, type SiftLayout } from './layout.js';

type SiftCtx = {
  theme: SiftTheme;
  setTheme: (next: Partial<SiftTheme>) => void;
  layout: SiftLayout;
  setLayout: (next: Partial<SiftLayout>) => void;
  resetLayout: () => void;
  debug: boolean;
  setDebug: (v: boolean) => void;
  /** Per-element importance overrides keyed by stable id. 0..3, or null. */
  importance: Record<string, number>;
  setImportance: (id: string, value: number | null) => void;
};

const Ctx = createContext<SiftCtx | null>(null);

export function useSift(): SiftCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSift must be used inside <SiftRoot>');
  return v;
}

/** Hook that returns the active layout knobs (pad/gap/toolbarH/sideW). */
export function useSiftLayout(): SiftLayout {
  const v = useContext(Ctx);
  return v?.layout ?? DEFAULT_LAYOUT;
}

/** Hook for components that want their own importance overridable by id. */
export function useImportance(id: string | undefined, fallback = 1): number {
  const ctx = useContext(Ctx);
  if (!ctx || !id) return fallback;
  return ctx.importance[id] ?? fallback;
}

export function SiftRoot(props: {
  children: ReactNode;
  initialTheme?: SiftTheme;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const [theme, setThemeState] = useState<SiftTheme>(
    props.initialTheme ?? DEFAULT_THEME,
  );
  const [layout, setLayoutState] = useState<SiftLayout>(DEFAULT_LAYOUT);
  const [debug, setDebug] = useState(false);
  const [importance, setImportanceMap] = useState<Record<string, number>>({});

  const setTheme = useMemo(
    () =>
      (next: Partial<SiftTheme>) =>
        setThemeState((cur) => ({ ...cur, ...next })),
    [],
  );

  const setLayout = useMemo(
    () =>
      (next: Partial<SiftLayout>) =>
        setLayoutState((cur) => ({ ...cur, ...next })),
    [],
  );
  const resetLayout = useMemo(
    () => () => setLayoutState(DEFAULT_LAYOUT),
    [],
  );

  const setImportance = useMemo(
    () =>
      (id: string, value: number | null) =>
        setImportanceMap((m) => {
          if (value == null) {
            const { [id]: _, ...rest } = m;
            return rest;
          }
          return { ...m, [id]: value };
        }),
    [],
  );

  // Persist theme + importance overrides + debug flag in localStorage so
  // they survive reloads. This is opt-in: drop a key to reset.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sift.state');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        theme?: SiftTheme;
        layout?: SiftLayout;
        importance?: Record<string, number>;
        debug?: boolean;
      };
      if (parsed.theme) setThemeState({ ...DEFAULT_THEME, ...parsed.theme });
      if (parsed.layout)
        setLayoutState({ ...DEFAULT_LAYOUT, ...parsed.layout });
      if (parsed.importance) setImportanceMap(parsed.importance);
      if (parsed.debug != null) setDebug(parsed.debug);
    } catch {
      // ignore — corrupt or unavailable storage shouldn't break the app.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        'sift.state',
        JSON.stringify({ theme, layout, importance, debug }),
      );
    } catch {
      /* ignore */
    }
  }, [theme, layout, importance, debug]);

  const tokens = useMemo(() => buildTokens(theme), [theme]);

  // Toggle debug mode with Ctrl+Shift+D — global shortcut so the dev can
  // bring it up from anywhere without hunting for a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setDebug((d) => !d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ctx = useMemo<SiftCtx>(
    () => ({
      theme,
      setTheme,
      layout,
      setLayout,
      resetLayout,
      debug,
      setDebug,
      importance,
      setImportance,
    }),
    [theme, setTheme, layout, setLayout, resetLayout, debug, importance, setImportance],
  );

  return (
    <Ctx.Provider value={ctx}>
      <div
        className={`sf-root ${props.className ?? ''}`.trim()}
        data-sf-debug={debug}
        style={{ ...(tokens as CSSProperties), ...(props.style ?? {}) }}
      >
        {props.children}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Locally tighten or loosen contrast / spacing. Used to satisfy the
 * "closer things are, the more they share colours" rule for sub-elements
 * (slider track + knob, checkbox + tick, anything sub-component).
 */
export function ClosenessGroup(props: {
  factor?: number; // 0.25..2; smaller = closer (less contrast)
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const close = props.factor ?? 0.75;
  return (
    <div
      className={`sf-close ${props.className ?? ''}`.trim()}
      style={{
        ['--sf-close' as string]: close.toFixed(3),
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * Wraps a child element with `data-imp` and a stable id that the debug
 * popover can target. The level is the user override (if any) or
 * `defaultLevel`.
 */
export function Imp(props: {
  id?: string;
  level?: number;
  children: ReactNode;
}): JSX.Element {
  const ctx = useContext(Ctx);
  const level =
    props.id && ctx?.importance[props.id] != null
      ? ctx.importance[props.id]
      : (props.level ?? 1);
  const ref = useRef<HTMLSpanElement>(null);
  // Apply attributes on the immediate child via a wrapper span. Span is
  // display:contents so it doesn't disrupt layout.
  return (
    <span
      ref={ref}
      data-imp={level}
      data-sf-imp-id={props.id}
      className={props.id ? 'sf-imp-target' : undefined}
      style={{ display: 'contents' }}
    >
      {props.children}
    </span>
  );
}
