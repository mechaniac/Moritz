import { describe, expect, it } from 'vitest';
import { triangulateStrokeRibbon } from '../../src/core/ribbon.js';
import {
  constantWidth,
  v2,
  ZERO,
  type StyleSettings,
  type Stroke,
} from '../../src/core/types.js';

const style: StyleSettings = {
  slant: 0,
  scaleX: 1,
  scaleY: 1,
  defaultWidth: constantWidth(10),
  widthOrientation: 'tangent',
  worldAngle: 0,
  capStart: 'round',
  capEnd: 'round',
};

const lineStroke: Stroke = {
  id: 's',
  vertices: [
    { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
    { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
  ],
};

describe('triangulateStrokeRibbon', () => {
  it('fixed mode emits 2 quad-strip triangles per pair of samples + cap fans', () => {
    const r = triangulateStrokeRibbon(lineStroke, style, {
      kind: 'fixed',
      samplesPerSegment: 4,
    });
    // 5 samples → 4 quads → 8 quad triangles + 2*(8-1)=14 cap fan triangles? Actually
    // CAP_FAN_STEPS = 8, so each cap is 8 triangles. Total = 8 + 8 + 8 = 24.
    expect(r.triangles.length).toBeGreaterThanOrEqual(8 + 8 + 8);
    expect(r.polygon.length).toBeGreaterThan(0);
  });

  it('density mode subdivides longer strokes into more triangles', () => {
    const r1 = triangulateStrokeRibbon(lineStroke, style, {
      kind: 'density',
      spacing: 50,
    });
    const r2 = triangulateStrokeRibbon(lineStroke, style, {
      kind: 'density',
      spacing: 5,
    });
    expect(r2.triangles.length).toBeGreaterThan(r1.triangles.length);
  });

  it('throws on closed strokes (open-stroke invariant)', () => {
    const closed: Stroke = {
      id: 's',
      vertices: [
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(10, 0), inHandle: ZERO, outHandle: ZERO },
        { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      ],
    };
    expect(() =>
      triangulateStrokeRibbon(closed, style, { kind: 'fixed', samplesPerSegment: 2 }),
    ).toThrow(/closed/i);
  });
});
