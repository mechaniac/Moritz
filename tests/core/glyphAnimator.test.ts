import { describe, expect, it } from 'vitest';
import {
  animateGlyphWithAnimator,
  glyphToUniversalGlyph,
} from '../../src/core/glyphAnimator.js';
import type { Glyph, GlyphAnimatorComponent } from '../../src/core/types.js';

describe('glyph animator', () => {
  it('converts a Moritz glyph to the universal Sigrid glyph shape', () => {
    const universal = glyphToUniversalGlyph(lineGlyph);

    expect(universal).toMatchObject({
      char: 'A',
      box: { w: 10, h: 10 },
      strokes: [{ id: 'stem' }],
    });
    expect(universal.strokes[0]?.vertices).toHaveLength(2);
  });

  it('animates symbols along a glyph stroke', () => {
    const result = animateGlyphWithAnimator(lineGlyph, {
      id: 'crawl',
      kind: 'symbol-along-stroke',
      symbols: [{ id: 'start' }, { id: 'middle' }, { id: 'end' }],
    });

    expect(result.animations).toHaveLength(1);
    expect(result.animations[0]?.frames.map((frame) => frame.id)).toEqual([
      'start',
      'middle',
      'end',
    ]);
    expect(result.animations[0]?.frames[1]?.p.x).toBeCloseTo(5, 4);
  });

  it('uses animator playback time as normalized arc movement', () => {
    const animator: GlyphAnimatorComponent = {
      id: 'single-runner',
      kind: 'symbol-along-stroke',
      symbols: [{ id: 'dot' }],
      speed: 1,
    };

    const result = animateGlyphWithAnimator(lineGlyph, animator, { time: 0.25 });

    expect(result.animations[0]?.frames[0]?.tArc).toBeCloseTo(0.25, 4);
    expect(result.animations[0]?.frames[0]?.p.x).toBeCloseTo(2.5, 4);
  });

  it('can target one stroke by id', () => {
    const glyph: Glyph = {
      ...lineGlyph,
      strokes: [
        lineGlyph.strokes[0]!,
        {
          id: 'crossbar',
          vertices: [
            vertex(0, 5),
            vertex(10, 5),
          ],
        },
      ],
    };

    const result = animateGlyphWithAnimator(glyph, {
      id: 'crossbar-runner',
      kind: 'symbol-along-stroke',
      symbols: [{ id: 'dot' }],
      strokeIds: ['crossbar'],
    });

    expect(result.animations.map((animation) => animation.strokeId)).toEqual(['crossbar']);
  });
});

const lineGlyph: Glyph = {
  char: 'A',
  box: { w: 10, h: 10 },
  strokes: [
    {
      id: 'stem',
      vertices: [
        vertex(0, 0),
        vertex(10, 0),
      ],
    },
  ],
};

function vertex(x: number, y: number): Glyph['strokes'][number]['vertices'][number] {
  return {
    p: { x, y },
    inHandle: { x: 0, y: 0 },
    outHandle: { x: 0, y: 0 },
  };
}
