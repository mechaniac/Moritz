import { describe, expect, it } from 'vitest';
import { buildMoritzGateway } from '../../src/core/gateway/moritzGateway.js';

describe('buildMoritzGateway', () => {
  it('glyphsetter gateway has persistence + editing functions', () => {
    const gw = buildMoritzGateway('glyphsetter');
    expect(Object.keys(gw)).toContain('saveFont');
    expect(Object.keys(gw)).toContain('loadFont');
    expect(Object.keys(gw)).toContain('deleteFont');
    expect(Object.keys(gw)).toContain('exportFont');
    expect(Object.keys(gw)).toContain('addStroke');
    expect(Object.keys(gw)).toContain('addAnchor');
    expect(Object.keys(gw)).toContain('deleteSelected');
    expect(Object.keys(gw)).toContain('flipH');
    expect(Object.keys(gw)).toContain('flipV');
    // Should NOT have style or page functions
    expect(Object.keys(gw)).not.toContain('saveStyle');
    expect(Object.keys(gw)).not.toContain('savePage');
  });

  it('bubblesetter gateway has bubble persistence functions', () => {
    const gw = buildMoritzGateway('bubblesetter');
    expect(Object.keys(gw)).toContain('saveBubbleFont');
    expect(Object.keys(gw)).toContain('loadBubbleFont');
    expect(Object.keys(gw)).toContain('deleteBubbleFont');
    expect(Object.keys(gw)).toContain('exportBubbleFont');
    expect(Object.keys(gw)).not.toContain('saveFont');
    expect(Object.keys(gw)).not.toContain('addStroke');
  });

  it('stylesetter gateway has persistence + live sliders', () => {
    const gw = buildMoritzGateway('stylesetter');
    expect(Object.keys(gw)).toContain('saveStyle');
    expect(Object.keys(gw)).toContain('loadStyle');
    expect(Object.keys(gw)).toContain('deleteStyle');
    expect(Object.keys(gw)).toContain('exportStyle');
    // Live sliders
    expect(Object.keys(gw)).toContain('setSlant');
    expect(Object.keys(gw)).toContain('setScaleX');
    expect(Object.keys(gw)).toContain('setScaleY');
    expect(Object.keys(gw)).toContain('setStrokeWidth');
    expect(Object.keys(gw)).toContain('setWorldBlend');
    expect(Object.keys(gw)).toContain('setCapStart');
    expect(Object.keys(gw)).toContain('setCapEnd');
    expect(Object.keys(gw)).toContain('setTracking');
    expect(Object.keys(gw)).toContain('setLineHeight');
    expect(Object.keys(gw)).not.toContain('saveFont');
    expect(Object.keys(gw)).not.toContain('addStroke');
  });

  it('typesetter gateway has page persistence functions', () => {
    const gw = buildMoritzGateway('typesetter');
    expect(Object.keys(gw)).toContain('savePage');
    expect(Object.keys(gw)).toContain('loadPage');
    expect(Object.keys(gw)).toContain('deletePage');
    expect(Object.keys(gw)).toContain('exportPage');
    expect(Object.keys(gw)).not.toContain('saveFont');
    expect(Object.keys(gw)).not.toContain('setSlant');
  });

  it('all gateway functions have callMode set', () => {
    for (const viewId of ['glyphsetter', 'bubblesetter', 'stylesetter', 'typesetter'] as const) {
      const gw = buildMoritzGateway(viewId);
      for (const [name, fn] of Object.entries(gw)) {
        expect(fn.callMode, `${viewId}.${name} missing callMode`).toBeDefined();
      }
    }
  });

  it('all gateway functions have summary', () => {
    for (const viewId of ['glyphsetter', 'bubblesetter', 'stylesetter', 'typesetter'] as const) {
      const gw = buildMoritzGateway(viewId);
      for (const [name, fn] of Object.entries(gw)) {
        expect(fn.summary, `${viewId}.${name} missing summary`).toBeTruthy();
      }
    }
  });

  it('live sliders have computeDefault', () => {
    const gw = buildMoritzGateway('stylesetter');
    const liveEntries = Object.entries(gw).filter(([, fn]) => fn.callMode === 'live');
    expect(liveEntries.length).toBeGreaterThan(0);
    for (const [name, fn] of liveEntries) {
      const param = fn.params[0];
      expect(param?.computeDefault, `${name} missing computeDefault`).toBeDefined();
    }
  });

  it('call is identity for all functions (handler intercepts)', () => {
    const gw = buildMoritzGateway('glyphsetter');
    const fakeTree = { cId: 'test', kind: 'test', children: [], tags: [] } as never;
    for (const [, fn] of Object.entries(gw)) {
      expect(fn.call(fakeTree, {})).toBe(fakeTree);
    }
  });
});
