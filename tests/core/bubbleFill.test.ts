import { describe, expect, it } from 'vitest';
import { chainPolylinesToLoops, fillLoopsForStrokes, loopsToPath } from '../../src/core/bubbleFill.js';
import type { Stroke, Vec2 } from '../../src/core/types.js';

const v = (x: number, y: number): Vec2 => ({ x, y });

const seg = (id: string, a: Vec2, b: Vec2): Stroke => ({
  id,
  vertices: [
    { p: a, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 } },
    { p: b, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 } },
  ],
});

describe('bubbleFill', () => {
  it('chains four edges of a square into one closed loop', () => {
    const loops = chainPolylinesToLoops(
      [
        [v(0, 0), v(10, 0)],
        [v(10, 0), v(10, 10)],
        [v(10, 10), v(0, 10)],
        [v(0, 10), v(0, 0)],
      ],
      0.001,
    );
    expect(loops).toHaveLength(1);
    expect(loops[0]!.length).toBeGreaterThanOrEqual(4);
  });

  it('reverses edges where needed to keep the chain going', () => {
    // Same square, but two edges reversed.
    const loops = chainPolylinesToLoops(
      [
        [v(0, 0), v(10, 0)],
        [v(10, 10), v(10, 0)], // reversed
        [v(10, 10), v(0, 10)],
        [v(0, 0), v(0, 10)],   // reversed
      ],
      0.001,
    );
    expect(loops).toHaveLength(1);
  });

  it('emits separate loops when nothing matches', () => {
    const loops = chainPolylinesToLoops(
      [
        [v(0, 0), v(10, 0)],
        [v(50, 50), v(60, 50)],
      ],
      0.001,
    );
    expect(loops).toHaveLength(2);
  });

  it('builds a fill path for a hexagon-of-strokes glyph', () => {
    // Six strokes meeting at hexagon vertices.
    const r = 50;
    const pts: Vec2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      pts.push(v(r * Math.cos(a) + 100, r * Math.sin(a) + 100));
    }
    const strokes: Stroke[] = pts.map((p, i) =>
      seg(`s${i}`, p, pts[(i + 1) % 6]!),
    );
    const loops = fillLoopsForStrokes(strokes);
    expect(loops).toHaveLength(1);
    const d = loopsToPath(loops);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('returns empty for no strokes', () => {
    expect(fillLoopsForStrokes([])).toEqual([]);
    expect(loopsToPath([])).toBe('');
  });
});
