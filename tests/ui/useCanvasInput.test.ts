import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  isPanGesture,
  wheelZoomFactor,
} from '../../src/ui/canvas/useCanvasInput.js';

describe('clampZoom', () => {
  it('passes values inside the range through', () => {
    expect(clampZoom(5, 1, 30)).toBe(5);
    expect(clampZoom(1, 1, 30)).toBe(1);
    expect(clampZoom(30, 1, 30)).toBe(30);
  });
  it('clamps below the min', () => {
    expect(clampZoom(0.1, 1, 30)).toBe(1);
    expect(clampZoom(-5, 1, 30)).toBe(1);
  });
  it('clamps above the max', () => {
    expect(clampZoom(50, 1, 30)).toBe(30);
    expect(clampZoom(Infinity, 1, 30)).toBe(30);
  });
});

describe('wheelZoomFactor', () => {
  it('returns 1 at deltaY = 0 (no movement, no change)', () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });
  it('returns >1 for negative deltaY (scroll up = zoom in)', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
  });
  it('returns <1 for positive deltaY (scroll down = zoom out)', () => {
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });
  it('is multiplicatively symmetric: f(d) * f(-d) === 1', () => {
    const d = 137;
    expect(wheelZoomFactor(d) * wheelZoomFactor(-d)).toBeCloseTo(1, 12);
  });
  it('chains additively in log-space: f(a)*f(b) === f(a+b)', () => {
    const a = 50;
    const b = 75;
    expect(wheelZoomFactor(a) * wheelZoomFactor(b)).toBeCloseTo(
      wheelZoomFactor(a + b),
      12,
    );
  });
});

describe('isPanGesture', () => {
  it('default mode "both": middle-mouse OR space+left-mouse', () => {
    expect(isPanGesture(1, false)).toBe(true); // middle
    expect(isPanGesture(0, true)).toBe(true); // space + left
    expect(isPanGesture(0, false)).toBe(false);
    expect(isPanGesture(2, false)).toBe(false); // right
  });
  it('mode "space": only space+left-mouse', () => {
    expect(isPanGesture(0, true, 'space')).toBe(true);
    expect(isPanGesture(1, false, 'space')).toBe(false);
    expect(isPanGesture(0, false, 'space')).toBe(false);
  });
  it('mode "middle": only middle-mouse', () => {
    expect(isPanGesture(1, false, 'middle')).toBe(true);
    expect(isPanGesture(0, true, 'middle')).toBe(false);
  });
  it('mode "none": never', () => {
    expect(isPanGesture(1, false, 'none')).toBe(false);
    expect(isPanGesture(0, true, 'none')).toBe(false);
  });
});
