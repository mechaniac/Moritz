import { describe, it, expect } from 'vitest';
import { bubbleGeometry } from '../../src/core/bubble.js';

describe('bubbleGeometry', () => {
  it('returns empty for shape "none"', () => {
    const g = bubbleGeometry('none', 100, 60);
    expect(g.main).toBe('');
    expect(g.extras).toHaveLength(0);
  });

  it('produces a closed path for "rect"', () => {
    const g = bubbleGeometry('rect', 100, 60);
    expect(g.main.startsWith('M')).toBe(true);
    expect(g.main.trim().endsWith('Z')).toBe(true);
  });

  it('"speech" path closes and references the tail tip coordinates', () => {
    const g = bubbleGeometry('speech', 100, 60, { x: 30, y: 100 });
    expect(g.main.trim().endsWith('Z')).toBe(true);
    // Tail tip x-coordinate should appear verbatim somewhere in the path.
    expect(g.main).toContain('30');
    expect(g.main).toContain('100');
  });

  it('"cloud" emits scallops + 2 satellite dots', () => {
    const g = bubbleGeometry('cloud', 120, 80, { x: 200, y: 150 });
    expect(g.main.trim().endsWith('Z')).toBe(true);
    expect(g.extras).toHaveLength(2);
    for (const e of g.extras) {
      expect(e.trim().endsWith('Z')).toBe(true);
    }
  });
});
