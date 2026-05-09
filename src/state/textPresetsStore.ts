/**
 * Persisted user overrides for the built-in text presets and the
 * currently-active preset per consumer (StyleSetter, TypeSetter).
 *
 * Built-in presets in `data/textPresets.ts` are read-only at build time.
 * This store layers a `Record<presetKey, text>` on top so the user can
 * edit a preset's text and persist the change in localStorage. The
 * `presetKey` is `${setId}::${index}` — the same key used in dropdown
 * <option value="…">.
 *
 * `activeBy` remembers which preset the user last picked in each module
 * so the dropdown can show it as the current selection on reload.
 */

import { create } from 'zustand';
import {
  textPresetSets,
  type TextPresetBubble,
  type TextPresetSet,
} from '../data/textPresets.js';

const OVERRIDES_KEY = 'moritz.textPresets.overrides';
const ACTIVE_KEY = 'moritz.textPresets.activeBy';

export type PresetConsumer = 'stylesetter' | 'typesetter';

type State = {
  overrides: Record<string, string>;
  activeBy: Partial<Record<PresetConsumer, string | null>>;
  setOverride: (key: string, text: string) => void;
  setActive: (consumer: PresetConsumer, key: string | null) => void;
};

function loadOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    // Bad JSON / no localStorage — fall through to empty overrides.
  }
  return {};
}

function loadActive(): Partial<Record<PresetConsumer, string | null>> {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<Record<PresetConsumer, string | null>>;
    }
  } catch {
    // ignore
  }
  return {};
}

export const useTextPresetsStore = create<State>((set, get) => ({
  overrides: loadOverrides(),
  activeBy: loadActive(),
  setOverride: (key, text) => {
    const next = { ...get().overrides, [key]: text };
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
    set({ overrides: next });
  },
  setActive: (consumer, key) => {
    const next = { ...get().activeBy, [consumer]: key };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
    set({ activeBy: next });
  },
}));

/** Build a `setId::idx` key from a set + index. */
export function presetKey(setId: string, idx: number): string {
  return `${setId}::${idx}`;
}

/** Resolve the effective text for a preset, applying any user override. */
export function effectivePresetText(
  set: TextPresetSet,
  idx: number,
  overrides: Record<string, string>,
): string {
  const k = presetKey(set.id, idx);
  return overrides[k] ?? set.bubbles[idx]?.text ?? '';
}

/**
 * Resolve a `(set, bubble)` tuple from a key, with the override applied to
 * `bubble.text`. Returns null for an unknown key.
 */
export function resolvePresetByKey(
  key: string,
  overrides: Record<string, string>,
):
  | { set: TextPresetSet; idx: number; bubble: TextPresetBubble }
  | null {
  const [setId, idxStr] = key.split('::');
  const set = textPresetSets.find((s) => s.id === setId);
  if (!set) return null;
  const idx = Number(idxStr);
  const original = set.bubbles[idx];
  if (!original) return null;
  const override = overrides[key];
  const bubble: TextPresetBubble =
    override !== undefined ? { ...original, text: override } : original;
  return { set, idx, bubble };
}
