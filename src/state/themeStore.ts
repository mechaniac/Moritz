/**
 * Theme store — picks one of three named colour schemes for the whole UI.
 *
 * Each scheme assigns a palette to each of the three modules
 * (glyphsetter / stylesetter / typesetter). The actual CSS variables are
 * declared in `styles.css` under `:root[data-theme="<id>"]`; this store
 * just remembers which one is active and persists the choice.
 */

import { create } from 'zustand';

export type ThemeId =
  | 'pastel'
  | 'dusk'
  | 'kraft'
  | 'noir'
  | 'neon'
  | 'sepia'
  | 'riso'
  | 'forest'
  | 'inkwash';

export const THEMES: readonly { id: ThemeId; name: string; blurb: string }[] = [
  {
    id: 'pastel',
    name: 'Pastel',
    blurb: 'Washed, low-contrast — light blue / peach / butter.',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'Deeper muted mid-tones — slate / clay / olive on dark.',
  },
  {
    id: 'kraft',
    name: 'Kraft',
    blurb: 'Earthy daylight — slate-grey / terracotta / mustard.',
  },
  {
    id: 'noir',
    name: 'Noir',
    blurb: 'High-contrast B&W chrome with a single hot accent per module.',
  },
  {
    id: 'neon',
    name: 'Neon',
    blurb: 'Saturated cyberpunk on near-black — loud on purpose.',
  },
  {
    id: 'sepia',
    name: 'Sepia',
    blurb: 'Vintage newspaper — warm cream paper, ink-brown chrome.',
  },
  {
    id: 'riso',
    name: 'Risograph',
    blurb: 'Punchy two-and-a-half-tone print: blues, pinks, mustards.',
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Moss greens, bark browns and lichen yellows on cream.',
  },
  {
    id: 'inkwash',
    name: 'Inkwash',
    blurb: 'Cool greys with a single steel-blue accent per module.',
  },
];

const KEY = 'moritz.theme';

function loadInitial(): ThemeId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && THEMES.some((t) => t.id === raw)) return raw as ThemeId;
  } catch {
    /* ignore */
  }
  return 'pastel';
}

type ThemeState = {
  theme: ThemeId;
  settingsOpen: boolean;
  setTheme: (t: ThemeId) => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: loadInitial(),
  settingsOpen: false,
  setTheme: (t) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    set({ theme: t });
  },
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
