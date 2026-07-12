import { describe, expect, it } from 'vitest';
import {
  MORITZ_MODULE_ID,
  moritzModuleSkin,
  moritzModuleSkinFor,
  moritzViewSkins,
} from '../../src/moduleSkins.js';
import { moritzModules } from '../../src/workspace.js';

describe('moritz module skins', () => {
  it('defines one public cModule skin for the Moritz suite', () => {
    expect(MORITZ_MODULE_ID).toBe('moritz');
    expect(moritzModuleSkinFor('moritz')).toEqual(moritzModuleSkin);
  });

  it('keeps internal view skins separate from topbar modules', () => {
    expect(Object.keys(moritzViewSkins)).toEqual([
      'glyphsetter',
      'bubblesetter',
      'stylesetter',
      'typesetter',
    ]);
  });

  it('registers product-level modules in the topbar', () => {
    expect(moritzModules.map((module) => module.id)).toEqual([
      'moritz',
      'sigrid',
      'magdalena',
      'anita',
    ]);
  });

  it('can still return an internal view skin for Moritz controls', () => {
    expect(moritzModuleSkinFor('glyphsetter')).toEqual(moritzViewSkins.glyphsetter);
    expect(moritzModuleSkinFor('typesetter')).toMatchObject({
      bg: '#46370f',
      fg: '#ffd76d',
    });
  });

  it('keeps every skin in the two-colour cModule contract', () => {
    for (const skin of [moritzModuleSkin, ...Object.values(moritzViewSkins)]) {
      expect(skin.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(skin.fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Object.keys(skin).sort()).toEqual(['bg', 'fg']);
    }
  });
});
