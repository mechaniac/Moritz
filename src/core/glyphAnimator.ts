import {
  animateGlyphSymbolsAlongStroke2d,
  type GlyphSymbolAnimation2d,
  type GlyphSymbolFrame2d,
} from '@christof/sigrid-curves';
import type { Glyph2d, GlyphSplineStroke } from '@christof/sigrid/glyph';
import type { Glyph, GlyphAnimatorComponent, Stroke } from './types.js';

export type UniversalGlyph = Glyph2d;

export type GlyphAnimatorPlayback = {
  readonly time?: number;
  readonly phase?: number;
};

export type GlyphStrokeAnimation = {
  readonly glyphChar: string;
  readonly strokeId: string;
  readonly animation: GlyphSymbolAnimation2d;
  readonly frames: readonly GlyphSymbolFrame2d[];
};

export type GlyphAnimatorResult = {
  readonly glyph: UniversalGlyph;
  readonly animations: readonly GlyphStrokeAnimation[];
};

/**
 * Convert Moritz's richer glyph object into the universal, renderer-neutral
 * glyph shape consumed by Sigrid curve helpers.
 */
export function glyphToUniversalGlyph(glyph: Glyph): UniversalGlyph {
  return {
    char: glyph.char,
    box: glyph.box,
    strokes: glyph.strokes.map(strokeToUniversalGlyphStroke),
    ...(glyph.sidebearings ? { sidebearings: glyph.sidebearings } : {}),
    ...(glyph.baselineOffset !== undefined ? { baselineOffset: glyph.baselineOffset } : {}),
  };
}

export function strokeToUniversalGlyphStroke(stroke: Stroke): GlyphSplineStroke {
  return {
    id: stroke.id,
    vertices: stroke.vertices,
  };
}

/**
 * Run a glyph's animator component and return pure animation frames. This is
 * intentionally not a React component; UI/runtime layers decide how to render
 * these frames.
 */
export function animateGlyphWithAnimator(
  glyph: Glyph,
  animator: GlyphAnimatorComponent | undefined = glyph.animator,
  playback: GlyphAnimatorPlayback = {},
): GlyphAnimatorResult {
  const universal = glyphToUniversalGlyph(glyph);
  if (!animator || animator.symbols.length === 0) {
    return { glyph: universal, animations: [] };
  }

  const strokeIds = animator.strokeIds ? new Set(animator.strokeIds) : null;
  const animations = glyph.strokes.flatMap((stroke): GlyphStrokeAnimation[] => {
    if (strokeIds && !strokeIds.has(stroke.id)) return [];
    const animation = animateGlyphSymbolsAlongStroke2d(
      strokeToUniversalGlyphStroke(stroke),
      {
        symbols: animator.symbols,
        ...(animator.samplesPerSegment !== undefined
          ? { samplesPerSegment: animator.samplesPerSegment }
          : {}),
        phase: (animator.phase ?? 0) + (playback.phase ?? 0),
        ...(playback.time !== undefined ? { time: playback.time } : {}),
        ...(animator.speed !== undefined ? { speed: animator.speed } : {}),
        ...(animator.direction !== undefined ? { direction: animator.direction } : {}),
        ...(animator.spacing !== undefined ? { spacing: animator.spacing } : {}),
        ...(animator.loop !== undefined ? { loop: animator.loop } : {}),
        ...(animator.easing !== undefined ? { easing: animator.easing } : {}),
      },
    );
    return [{
      glyphChar: glyph.char,
      strokeId: stroke.id,
      animation,
      frames: animation.frames,
    }];
  });

  return { glyph: universal, animations };
}
