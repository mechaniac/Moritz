import type { MgSkinDefinition } from '@christof/magdalena/core';
import type { ModuleId } from './state/store.js';

export const moritzModuleSkinIds = Object.freeze({
  glyphsetter: 'moritz.module.glyphsetter',
  bubblesetter: 'moritz.module.bubblesetter',
  stylesetter: 'moritz.module.stylesetter',
  typesetter: 'moritz.module.typesetter',
} satisfies Record<ModuleId, string>);

export const moritzModuleSkins = Object.freeze({
  glyphsetter: moduleSkin('glyphsetter', 'GlyphSetter', 210, 0.46),
  bubblesetter: moduleSkin('bubblesetter', 'BubbleSetter', 204, 0.36),
  stylesetter: moduleSkin('stylesetter', 'StyleSetter', 34, 0.58),
  typesetter: moduleSkin('typesetter', 'TypeSetter', 48, 0.56),
} satisfies Record<ModuleId, MgSkinDefinition>);

export const moritzModuleSkinList = Object.freeze([
  moritzModuleSkins.glyphsetter,
  moritzModuleSkins.bubblesetter,
  moritzModuleSkins.stylesetter,
  moritzModuleSkins.typesetter,
]);

export function moritzModuleSkinFor(module: ModuleId): MgSkinDefinition {
  return moritzModuleSkins[module];
}

function moduleSkin(
  module: ModuleId,
  label: string,
  hue: number,
  saturation: number,
): MgSkinDefinition {
  return {
    id: moritzModuleSkinIds[module],
    label,
    scope: 'module',
    ownerId: 'moritz',
    editPolicy: 'consumerEditable',
    settings: {
      theme: {
        contrastColorNight: { hue, saturation, lightness: 0.13, intensity: 0.58 },
        contrastColorDay: { hue, saturation: Math.max(0.22, saturation - 0.16), lightness: 0.86, intensity: 0.38 },
        globalContrast: 0.82,
        localContrast: 0.56,
        foregroundBrightness: 0.18,
        selectedBrightness: 0.13,
        selectedContrast: 0.2,
        saturation,
      },
      signals: {
        relevant: { hue, saturation: Math.min(0.72, saturation + 0.14), lightness: 0.6, paint: 0.48 },
        annotation: { hue: (hue + 26) % 360, saturation: 0.42, lightness: 0.62, paint: 0.34 },
        changed: { hue: 338, saturation: 0.58, lightness: 0.58, paint: 0.44 },
        save: { hue: 122, saturation: 0.5, lightness: 0.56, paint: 0.4 },
      },
    },
  };
}
