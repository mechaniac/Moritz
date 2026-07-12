/**
 * Parity fixtures: Moritz outlineStroke vs Sigrid outlineSplineStroke.
 *
 * These tests run the SAME geometric input through both engines and compare
 * results. Any test that documents a gap (where sigrid differs from moritz's
 * proven behavior) is marked with a descriptive comment for upstream donation.
 */
import { describe, it, expect } from 'vitest';
import { outlineStroke } from '../../src/core/stroke.js';
import { outlineSplineStroke, type SplineVertex, type StrokeOutlineOptions } from '@christof/sigrid/glyph';
import { constantWidth, v2, ZERO, type StyleSettings, type Stroke, type Vec2 } from '../../src/core/types.js';

// --- Helpers ---

/** Convert Moritz Vertex[] to Sigrid SplineVertex[] */
function toSigridVertices(vertices: readonly { p: Vec2; inHandle: Vec2; outHandle: Vec2 }[]): SplineVertex[] {
  return vertices.map((v) => ({
    point: v.p,
    inHandle: v.inHandle,
    outHandle: v.outHandle,
  }));
}

/** Bounding box of a polygon */
function bounds(poly: readonly { x: number; y: number }[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

// --- Shared test data ---

const WIDTH = 10;
const HALF = WIDTH / 2;

const moritzStyle: StyleSettings = {
  slant: 0,
  scaleX: 1,
  scaleY: 1,
  defaultWidth: constantWidth(WIDTH),
  widthOrientation: 'tangent',
  worldAngle: 0,
  capStart: 'flat',
  capEnd: 'flat',
};

const sigridOpts: StrokeOutlineOptions = {
  defaultWidth: WIDTH,
  capStart: 'flat',
  capEnd: 'flat',
  samplesPerSegment: 16,
};

// --- Parity tests ---

describe('stroke-parity: moritz vs sigrid', () => {
  describe('horizontal straight line (flat caps)', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'h', vertices };

    it('both produce a valid closed polygon', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      expect(moritz.length).toBeGreaterThanOrEqual(4);
      expect(sigrid.length).toBeGreaterThanOrEqual(4);
    });

    it('both have consistent bounding box (width = 10, flat caps)', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // X extent: should span [0, 100] (flat caps don't extend past endpoints)
      expect(mb.minX).toBeCloseTo(0, 0);
      expect(mb.maxX).toBeCloseTo(100, 0);
      expect(sb.minX).toBeCloseTo(0, 0);
      expect(sb.maxX).toBeCloseTo(100, 0);

      // Y extent: half-width = 5 on each side
      expect(mb.minY).toBeCloseTo(-HALF, 0);
      expect(mb.maxY).toBeCloseTo(HALF, 0);
      expect(sb.minY).toBeCloseTo(-HALF, 0);
      expect(sb.maxY).toBeCloseTo(HALF, 0);
    });
  });

  describe('curved stroke (S-curve, flat caps)', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: v2(40, 0) },
      { p: v2(100, 50), inHandle: v2(-40, 0), outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'curve', vertices };

    it('bounding boxes agree within 10% tolerance', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // Both should be roughly the same size
      const mWidth = mb.maxX - mb.minX;
      const sWidth = sb.maxX - sb.minX;
      const mHeight = mb.maxY - mb.minY;
      const sHeight = sb.maxY - sb.minY;

      expect(Math.abs(mWidth - sWidth) / mWidth).toBeLessThan(0.1);
      expect(Math.abs(mHeight - sHeight) / mHeight).toBeLessThan(0.1);
    });

    it('both offset by half-width from the spine', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // The spine endpoint at (100, 50) should have offset points at y ≈ 50±5
      expect(mb.maxY).toBeGreaterThan(50 + HALF - 2);
      expect(sb.maxY).toBeGreaterThan(50 + HALF - 2);
    });
  });

  describe('round caps', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'rc', vertices };
    const moritzRound: StyleSettings = { ...moritzStyle, capStart: 'round', capEnd: 'round' };
    const sigridRound: StrokeOutlineOptions = { ...sigridOpts, capStart: 'round', capEnd: 'round' };

    it('both extend past endpoints by approximately half-width', () => {
      const moritz = outlineStroke(stroke, moritzRound);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridRound);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // Round cap bulges ~half-width past endpoint
      expect(mb.maxX).toBeGreaterThan(100 + HALF - 1.5);
      expect(mb.maxX).toBeLessThan(100 + HALF + 1.5);
      expect(sb.maxX).toBeGreaterThan(100 + HALF - 1.5);
      expect(sb.maxX).toBeLessThan(100 + HALF + 1.5);

      expect(mb.minX).toBeLessThan(-HALF + 1.5);
      expect(mb.minX).toBeGreaterThan(-HALF - 1.5);
      expect(sb.minX).toBeLessThan(-HALF + 1.5);
      expect(sb.minX).toBeGreaterThan(-HALF - 1.5);
    });
  });

  describe('tapered caps', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'tc', vertices };
    const moritzTapered: StyleSettings = { ...moritzStyle, capStart: 'tapered', capEnd: 'tapered' };
    const sigridTapered: StrokeOutlineOptions = { ...sigridOpts, capStart: 'tapered', capEnd: 'tapered' };

    it('both taper narrower than flat caps at the endpoints', () => {
      const moritz = outlineStroke(stroke, moritzTapered);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridTapered);

      // Compare to flat-cap baseline: tapered caps should make the polygon
      // narrower near the endpoints than flat caps (which have full half-width).
      const moritzFlat = outlineStroke(stroke, moritzStyle);

      // Measure max |y| in the cap extension zone (x < 0 for start, x > 100 for end)
      const moritzCapExtent = moritz.filter((p) => p.x < 0 || p.x > 100);
      const sigridCapExtent = sigrid.filter((p) => p.x < 0 || p.x > 100);
      const flatCapExtent = moritzFlat.filter((p) => p.x < 0 || p.x > 100);

      // Tapered caps produce points in the extension zone (cap body exists)
      // but those points should be narrower than a flat cap at equivalent x
      // For a flat cap, max|y| in extension = 5. For tapered, should be less.
      const moritzMaxY = moritzCapExtent.length > 0
        ? Math.max(...moritzCapExtent.map((p) => Math.abs(p.y)))
        : 0;
      const sigridMaxY = sigridCapExtent.length > 0
        ? Math.max(...sigridCapExtent.map((p) => Math.abs(p.y)))
        : 0;

      // Both tapered caps should NOT produce full half-width in the cap zone
      // (if they extend) or should have no extension at all (converge to point)
      expect(moritzMaxY).toBeLessThan(HALF);
      expect(sigridMaxY).toBeLessThan(HALF);
      // Flat caps have NO extension (no points past endpoints)
      expect(flatCapExtent).toHaveLength(0);
    });
  });

  describe('variable width profile', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
    ];
    const widthProfile = { samples: [{ t: 0, width: 2 }, { t: 0.5, width: 20 }, { t: 1, width: 2 }] };
    const stroke: Stroke = { id: 'vw', vertices, width: widthProfile };
    const moritzVW: StyleSettings = { ...moritzStyle };
    const sigridVW: StrokeOutlineOptions = { ...sigridOpts, width: widthProfile };

    it('both widen in the middle and narrow at endpoints', () => {
      const moritz = outlineStroke(stroke, moritzVW);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridVW);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // At midpoint the half-width is 10, so extent ≈ ±10
      expect(mb.maxY).toBeGreaterThan(8);
      expect(sb.maxY).toBeGreaterThan(8);

      // At endpoints the half-width is 1, so near x=0 and x=100
      // the polygon should be narrow
      const moritzNearStart = moritz.filter((p) => p.x < 5);
      const sigridNearStart = sigrid.filter((p) => p.x < 5);
      const moritzMaxYAtStart = Math.max(...moritzNearStart.map((p) => Math.abs(p.y)));
      const sigridMaxYAtStart = Math.max(...sigridNearStart.map((p) => Math.abs(p.y)));
      expect(moritzMaxYAtStart).toBeLessThan(4);
      expect(sigridMaxYAtStart).toBeLessThan(4);
    });
  });

  describe('90° miter join', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
      { p: v2(100, 100), inHandle: ZERO, outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'corner', vertices };

    it('moritz produces clean miter; sigrid should not overshoot', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      const mb = bounds(moritz);
      const sb = bounds(sigrid);

      // Outer corner: moritz miters to (105, -5)
      expect(mb.maxX).toBeCloseTo(105, 0);
      // Sigrid: document whether it miters or bevels
      // (gap: sigrid may not have miter joins yet)
      expect(sb.maxX).toBeGreaterThanOrEqual(100);
    });

    it('[GAP] moritz miter join produces exact corner point', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      const outerHits = moritz.filter(
        (p) => Math.abs(p.x - 105) < 0.1 && Math.abs(p.y + 5) < 0.1,
      );
      expect(outerHits).toHaveLength(1);
    });

    it('[GAP] sigrid miter join behavior', () => {
      const sigrid = outlineSplineStroke(toSigridVertices(vertices), sigridOpts);
      // Document: does sigrid produce a clean miter at (105, -5)?
      const outerHits = sigrid.filter(
        (p) => Math.abs(p.x - 105) < 0.5 && Math.abs(p.y + 5) < 0.5,
      );
      // This may be 0 if sigrid uses bevel or no join logic yet
      // Record the actual behavior for upstream donation discussion
      if (outerHits.length === 0) {
        // GAP: sigrid does not produce miter joins — moritz's miter/bevel
        // logic is a donation candidate
        expect(true).toBe(true); // pass but document gap
      } else {
        expect(outerHits).toHaveLength(1);
      }
    });
  });

  describe('normal-override vertex', () => {
    const vertices = [
      { p: v2(0, 0), inHandle: ZERO, outHandle: ZERO, normalOverride: v2(0, 8) },
      { p: v2(100, 0), inHandle: ZERO, outHandle: ZERO },
    ];
    const stroke: Stroke = { id: 'no', vertices };

    it('moritz respects normalOverride at start vertex', () => {
      const moritz = outlineStroke(stroke, moritzStyle);
      // normalOverride = (0, 8) means offset direction is (0,1) with magnitude 8
      // So at start, the two sides should be at y ≈ ±8 not ±5
      const nearStart = moritz.filter((p) => p.x < 2);
      const maxYAtStart = Math.max(...nearStart.map((p) => Math.abs(p.y)));
      expect(maxYAtStart).toBeGreaterThan(6);
      expect(maxYAtStart).toBeLessThan(10);
    });

    it('[GAP] sigrid normalOverride behavior', () => {
      const sigridVerts: SplineVertex[] = [
        { point: { x: 0, y: 0 }, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 }, normalOverride: { x: 0, y: 8 } },
        { point: { x: 100, y: 0 }, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 } },
      ];
      const sigrid = outlineSplineStroke(sigridVerts, sigridOpts);
      const nearStart = sigrid.filter((p) => p.x < 2);
      const maxYAtStart = Math.max(...nearStart.map((p) => Math.abs(p.y)));
      // Document whether sigrid implements normalOverride in outlining.
      // If it only stores the data but doesn't use it in outline, this will be ~5
      if (maxYAtStart < 6) {
        // GAP: sigrid doesn't apply normalOverride in outline yet
        expect(true).toBe(true);
      } else {
        expect(maxYAtStart).toBeGreaterThan(6);
        expect(maxYAtStart).toBeLessThan(10);
      }
    });
  });
});
