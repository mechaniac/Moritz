/**
 * Sift design-token generator.
 *
 * One axis: `warmth` ∈ [0,1]. 0 = cold + dark night, 1 = warm + bright day.
 * Hue shifts cool→warm, lightness shifts dark→light along the same dial.
 *
 * Surfaces are a 7-step ramp from `bg` (furthest from ink) to `surface6`
 * (closest). Local contrast is the step between adjacent surfaces; smaller
 * is "closer" — wrappers inside `ClosenessGroup` walk the ramp more slowly.
 *
 * No pure 0/100% lightness ever — both bg and ink are clamped inwards.
 * Only at warmth=0 and warmth=1 do extremes touch the edges.
 *
 * All outputs are HSL strings so the browser handles interpolation when
 * we hand them to CSS transitions.
 */

export type SiftTheme = {
  /** 0 = night (cold + dark), 1 = day (warm + bright). */
  warmth: number;
  /** Global contrast multiplier on the surface ramp. 0..1.5. */
  contrast: number;
  /** Saturation multiplier. 0..1.5. */
  saturation: number;
};

export const DEFAULT_THEME: SiftTheme = {
  warmth: 0.18,
  contrast: 0.85,
  saturation: 0.6,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Hue along the warmth axis. Cold blue → warm amber. */
function hue(warmth: number): number {
  return lerp(228, 38, warmth);
}

/** Background lightness anchor. Goes deeper than ink at warmth=0. */
function bgL(warmth: number): number {
  return lerp(12, 92, warmth);
}

/** Saturation drops near the bright extreme so day mode reads paper-like. */
function sat(warmth: number, scale: number): number {
  const base = lerp(14, 8, warmth);
  return clamp(base * scale, 0, 28);
}

/**
 * 7-step surface ramp from `bg` to `surface6` plus `text` levels.
 * Returns HSL strings ready to drop into CSS variables.
 */
export function buildTokens(
  theme: SiftTheme = DEFAULT_THEME,
): Record<string, string> {
  const { warmth, contrast, saturation } = theme;
  const h = hue(warmth);
  const s = sat(warmth, saturation);
  const isDay = warmth > 0.5;

  // Surface ramp: walk away from bg toward ink. Step grows with contrast.
  const step = lerp(2.5, 7.5, clamp(contrast, 0, 1.5) / 1.5);
  // Bg is the furthest-from-ink end. Ink direction: lighter on day, darker
  // on night (so contrast with bg increases along the ramp).
  const dir = isDay ? -1 : 1;
  const bg = bgL(warmth);

  const surface = (i: number): string => {
    const l = clamp(bg + dir * step * i, 4, 96);
    return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
  };

  // Text levels — three steps further along the ramp from surface6.
  const textL = clamp(bg + dir * step * 9, 4, 96);
  const textMuteL = clamp(bg + dir * step * 7.2, 4, 96);
  const textFaintL = clamp(bg + dir * step * 5.4, 4, 96);

  // Accent hues are constant; lightness adapts to warmth so they sit on
  // top of the current surface without burning out.
  const accentL = isDay ? 38 : 62;
  const accentS = clamp(50 * saturation, 12, 70);
  const accent = (accentH: number): string =>
    `hsl(${accentH} ${accentS.toFixed(1)}% ${accentL}%)`;

  // Importance scales: a 4-step curve for size / weight / contrast bumps.
  const imp = (k: number, range: [number, number]): string =>
    lerp(range[0], range[1], k / 3).toFixed(3);

  return {
    '--sf-bg': surface(0),
    '--sf-surface-1': surface(1),
    '--sf-surface-2': surface(2),
    '--sf-surface-3': surface(3),
    '--sf-surface-4': surface(4.5),
    '--sf-surface-5': surface(6),
    '--sf-surface-6': surface(7.5),

    '--sf-line': surface(3.5),
    '--sf-line-strong': surface(5.5),

    '--sf-text': `hsl(${h.toFixed(1)} ${(s * 0.5).toFixed(1)}% ${textL.toFixed(1)}%)`,
    '--sf-text-mute': `hsl(${h.toFixed(1)} ${(s * 0.4).toFixed(1)}% ${textMuteL.toFixed(1)}%)`,
    '--sf-text-faint': `hsl(${h.toFixed(1)} ${(s * 0.3).toFixed(1)}% ${textFaintL.toFixed(1)}%)`,

    '--sf-accent-go': accent(140),    // green: generate / start
    '--sf-accent-note': accent(50),   // yellow: annotation / help
    '--sf-accent-hot': accent(28),    // orange: most-important-on-screen
    '--sf-accent-warn': accent(8),    // red: changed / save / destructive

    // Importance: 4 levels (0..3). Each token is a unitless multiplier or
    // an absolute size that components compose into their own rules.
    '--sf-imp-0-size': imp(0, [0.78, 0.78]),
    '--sf-imp-1-size': imp(1, [1.0, 1.0]),
    '--sf-imp-2-size': imp(2, [1.18, 1.18]),
    '--sf-imp-3-size': imp(3, [1.42, 1.42]),

    '--sf-imp-0-weight': '380',
    '--sf-imp-1-weight': '450',
    '--sf-imp-2-weight': '600',
    '--sf-imp-3-weight': '720',

    '--sf-imp-0-contrast': '0.55',
    '--sf-imp-1-contrast': '1.00',
    '--sf-imp-2-contrast': '1.35',
    '--sf-imp-3-contrast': '1.75',

    // Layout tokens. Closeness lives here as a multiplier the wrapper can
    // override locally (smaller value → tighter spacing, lower contrast).
    '--sf-close': '1',
    '--sf-pad': 'calc(8px * var(--sf-close, 1))',
    '--sf-pad-tight': 'calc(4px * var(--sf-close, 1))',
    '--sf-gap': 'calc(6px * var(--sf-close, 1))',
    '--sf-radius': '6px',
    '--sf-radius-tight': '3px',

    '--sf-anim-fast': '120ms',
    '--sf-anim-slow': '320ms',

    // Theme axis exposed for components that want to read it directly.
    '--sf-warmth': warmth.toFixed(3),
  };
}
