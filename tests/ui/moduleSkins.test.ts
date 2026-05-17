import { resolveMgSkins } from '@christof/magdalena/core';
import { describe, expect, it } from 'vitest';
import {
  moritzModuleSkinFor,
  moritzModuleSkinIds,
  moritzModuleSkinList,
} from '../../src/moduleSkins.js';

describe('moritz module skins', () => {
  it('defines one Magdalena module skin per top-level Moritz workspace', () => {
    const skins = resolveMgSkins(moritzModuleSkinList);

    expect(skins.map((skin) => skin.id)).toEqual([
      moritzModuleSkinIds.glyphsetter,
      moritzModuleSkinIds.bubblesetter,
      moritzModuleSkinIds.stylesetter,
      moritzModuleSkinIds.typesetter,
    ]);
    expect(skins.every((skin) => skin.scope === 'module')).toBe(true);
    expect(skins.every((skin) => skin.ownerId === 'moritz')).toBe(true);
    expect(skins.every((skin) => skin.editPolicy === 'consumerEditable')).toBe(true);
  });

  it('returns the active module skin by store module id', () => {
    expect(moritzModuleSkinFor('glyphsetter').id).toBe(moritzModuleSkinIds.glyphsetter);
    expect(moritzModuleSkinFor('typesetter').label).toBe('TypeSetter');
  });

  it('keeps core module skin settings explicit for downstream controls', () => {
    const glyph = moritzModuleSkinFor('glyphsetter');
    const type = moritzModuleSkinFor('typesetter');

    expect(glyph.settings?.theme?.contrastColorNight).toBeDefined();
    expect(glyph.settings?.theme?.contrastColorDay).toBeDefined();
    expect(glyph.settings?.signals?.changed?.hue).toBe(338);
    expect(glyph.settings?.signals?.save?.hue).toBe(122);

    expect(type.settings?.theme?.globalContrast).toBeGreaterThan(0);
    expect(type.settings?.theme?.localContrast).toBeGreaterThan(0);
    expect(type.settings?.signals?.relevant?.hue).toBe(48);
  });
});
