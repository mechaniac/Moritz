import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32 } from '../../src/core/random.js';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differs = false;
    for (let i = 0; i < 5; i++) if (a() !== b()) differs = true;
    expect(differs).toBe(true);
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
  });
  it('is order-sensitive', () => {
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
  });
  it('returns a 32-bit unsigned int', () => {
    const h = hashSeed(7, 99, 1234);
    expect(h >>> 0).toBe(h);
  });
});
