import { describe, expect, it } from 'vitest';
import { makeWidthMod } from '../../src/core/widthEffects.js';
import type { StyleSettings } from '../../src/core/types.js';
import { constantWidth } from '../../src/core/types.js';

const baseStyle: StyleSettings = {
  slant: 0,
  scaleX: 1,
  scaleY: 1,
  defaultWidth: constantWidth(10),
  widthOrientation: 'tangent',
  worldAngle: 0,
  capStart: 'flat',
  capEnd: 'flat',
};

const ctx = { instanceIndex: 0, char: 'a' };

describe('makeWidthMod', () => {
  it('returns null when no effects are configured', () => {
    expect(makeWidthMod(baseStyle, ctx, 100)).toBeNull();
  });

  it('returns null when taper is identity (1,1)', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: { widthTaper: { start: 1, end: 1 } },
    };
    expect(makeWidthMod(s, ctx, 100)).toBeNull();
  });

  it('returns null when wiggle amount is 0', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: { widthWiggle: { amount: 0, frequency: 0.1 } },
    };
    expect(makeWidthMod(s, ctx, 100)).toBeNull();
  });

  it('taper mode "stroke": linear ramp from start to end across [0,1]', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: { widthTaper: { start: 0.5, end: 1.5, mode: 'stroke' } },
    };
    const m = makeWidthMod(s, ctx, 100)!;
    expect(m(0)).toBeCloseTo(0.5, 6);
    expect(m(0.5)).toBeCloseTo(1.0, 6);
    expect(m(1)).toBeCloseTo(1.5, 6);
  });

  it('taper mode "length": ramp repeats every `length` units', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: {
        widthTaper: { start: 0, end: 1, mode: 'length', length: 50 },
      },
    };
    // arcLen = 100 → 2 full periods.
    const m = makeWidthMod(s, ctx, 100)!;
    // tArc=0   → dist 0   → u 0  → 0.0
    // tArc=0.25→ dist 25  → u .5 → 0.5
    // tArc=0.5 → dist 50  → u 0  → 0.0  (period boundary)
    expect(m(0)).toBeCloseTo(0, 6);
    expect(m(0.25)).toBeCloseTo(0.5, 6);
    expect(m(0.5)).toBeCloseTo(0, 6);
    expect(m(0.75)).toBeCloseTo(0.5, 6);
  });

  it('wiggle: deterministic for same seed and bounded by amount', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: { widthWiggle: { amount: 0.3, frequency: 0.1, seed: 42 } },
    };
    const a = makeWidthMod(s, ctx, 200)!;
    const b = makeWidthMod(s, ctx, 200)!;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(a(t)).toBeCloseTo(b(t), 9);
      expect(a(t)).toBeGreaterThanOrEqual(1 - 0.3 - 1e-9);
      expect(a(t)).toBeLessThanOrEqual(1 + 0.3 + 1e-9);
    }
  });

  it('wiggle with scope "glyph": same char shares seed, different chars differ', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: { widthWiggle: { amount: 0.3, frequency: 0.1, seed: 1, scope: 'glyph' } },
    };
    const a1 = makeWidthMod(s, { instanceIndex: 0, char: 'a' }, 100)!;
    const a2 = makeWidthMod(s, { instanceIndex: 9, char: 'a' }, 100)!;
    const b = makeWidthMod(s, { instanceIndex: 0, char: 'b' }, 100)!;
    expect(a1(0.3)).toBeCloseTo(a2(0.3), 9);
    expect(a1(0.3)).not.toBeCloseTo(b(0.3), 6);
  });

  it('combined wiggle + taper multiplies the two contributions', () => {
    const s: StyleSettings = {
      ...baseStyle,
      effects: {
        widthTaper: { start: 0.5, end: 0.5 }, // constant 0.5
        widthWiggle: { amount: 0.2, frequency: 0.1, seed: 7 },
      },
    };
    const m = makeWidthMod(s, ctx, 100)!;
    // taper * wiggle, with taper === 0.5 everywhere → result in 0.5*[0.8, 1.2].
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(m(t)).toBeGreaterThanOrEqual(0.5 * 0.8 - 1e-9);
      expect(m(t)).toBeLessThanOrEqual(0.5 * 1.2 + 1e-9);
    }
  });
});
