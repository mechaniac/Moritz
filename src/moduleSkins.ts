import type { cModule } from '@christof/sigrid/core';
import type { ModuleId } from './state/store.js';

export const MORITZ_MODULE_ID = 'moritz' as const;

export const moritzModuleSkin = Object.freeze({
  bg: '#1f2f3a',
  fg: '#f3c783',
} satisfies cModule['skin']);

export const moritzViewSkins = Object.freeze({
  glyphsetter: { bg: '#16334a', fg: '#91c8ff' },
  bubblesetter: { bg: '#123b3f', fg: '#82e5df' },
  stylesetter: { bg: '#442712', fg: '#ffb86f' },
  typesetter: { bg: '#46370f', fg: '#ffd76d' },
} satisfies Record<ModuleId, cModule['skin']>);

export const moritzModuleSkins = moritzViewSkins;

export function moritzModuleSkinFor(module: typeof MORITZ_MODULE_ID | ModuleId): cModule['skin'] {
  return module === MORITZ_MODULE_ID ? moritzModuleSkin : moritzViewSkins[module];
}
