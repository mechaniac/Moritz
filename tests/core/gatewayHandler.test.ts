import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { moritzFunctionCallHandler } from '../../src/core/gateway/moritzFunctionCallHandler.js';
import { useAppStore } from '../../src/state/store.js';
import type { PublicFn } from '@christof/sigrid/core';

// Stub browser APIs for tests that trigger persistence/export side effects
const mockLocalStorage = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

beforeAll(() => {
  (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
  // Minimal document stub for downloadBlob
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ href: '', download: '', click: () => {}, style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  (globalThis as Record<string, unknown>).URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  };
  (globalThis as Record<string, unknown>).Blob = class Blob {
    constructor(public parts: unknown[], public options?: unknown) {}
  };
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).URL;
  delete (globalThis as Record<string, unknown>).Blob;
});

/** Minimal MFunctionCall shape for testing */
function makeCall(name: string, args: Record<string, unknown> = {}, overrides?: {
  moduleId?: string;
  reset?: boolean;
}) {
  return {
    moduleId: overrides?.moduleId ?? 'moritz',
    name,
    fn: { call: (t: unknown) => t } as unknown as PublicFn,
    tree: { cId: 'root', kind: 'test', children: [], tags: [] } as never,
    args,
    selectedId: undefined,
    auto: false,
    reset: overrides?.reset ?? false,
  };
}

describe('moritzFunctionCallHandler', () => {
  it('returns false for non-moritz modules', () => {
    expect(moritzFunctionCallHandler(makeCall('saveFont', {}, { moduleId: 'sigrid' }))).toBe(false);
  });

  it('returns true for reset events (swallows them)', () => {
    expect(moritzFunctionCallHandler(makeCall('saveFont', {}, { reset: true }))).toBe(true);
  });

  it('returns false for unknown function names', () => {
    expect(moritzFunctionCallHandler(makeCall('nonExistentFunction', {}))).toBe(false);
  });

  describe('font operations', () => {
    it('handleSaveFont updates store with named font', () => {
      const before = useAppStore.getState().font;
      const result = moritzFunctionCallHandler(makeCall('saveFont', { name: 'Test Font' }));
      expect(result).toBe(true);
      const after = useAppStore.getState().font;
      expect(after.name).toBe('Test Font');
      expect(after.id).toBe('test-font');
      // Restore
      useAppStore.setState({ font: before });
    });

    it('handleSaveFont rejects empty name', () => {
      const before = useAppStore.getState().font;
      moritzFunctionCallHandler(makeCall('saveFont', { name: '' }));
      expect(useAppStore.getState().font).toBe(before);
    });

    it('handleExportFont returns true', () => {
      // Mock downloadBlob to prevent actual download
      const result = moritzFunctionCallHandler(makeCall('exportFont', {}));
      expect(result).toBe(true);
    });
  });

  describe('style operations', () => {
    it('style slider calls are NOT intercepted (return false)', () => {
      // Style sliders are real tree transforms — the handler should NOT
      // intercept them, allowing magdalena to execute fn.call() directly.
      expect(moritzFunctionCallHandler(makeCall('setSlant', { value: 0.25 }))).toBe(false);
      expect(moritzFunctionCallHandler(makeCall('setScaleX', { value: 1.5 }))).toBe(false);
      expect(moritzFunctionCallHandler(makeCall('setStrokeWidth', { value: 12 }))).toBe(false);
      expect(moritzFunctionCallHandler(makeCall('setCapStart', { value: 'flat' }))).toBe(false);
    });

    it('style persistence IS intercepted', () => {
      expect(moritzFunctionCallHandler(makeCall('saveStyle', { name: 'x' }))).toBe(true);
      expect(moritzFunctionCallHandler(makeCall('exportStyle', {}))).toBe(true);
    });
  });

  describe('glyph editing', () => {
    it('handleAddStroke returns true and modifies the glyph', () => {
      const result = moritzFunctionCallHandler(makeCall('addStroke', {}));
      expect(result).toBe(true);
      // Verify a stroke was added (count is at least 1)
      const glyph = useAppStore.getState().font.glyphs['A'];
      expect(glyph?.strokes.length).toBeGreaterThanOrEqual(1);
    });

    it('handleFlipH returns true even with no selection', () => {
      // With no stroke selected, should still return true (handled, just no-op)
      const result = moritzFunctionCallHandler(makeCall('flipH', {}));
      expect(result).toBe(true);
    });

    it('handleFlipV returns true even with no selection', () => {
      const result = moritzFunctionCallHandler(makeCall('flipV', {}));
      expect(result).toBe(true);
    });
  });

  describe('all known handlers return true', () => {
    const knownNames = [
      'saveFont', 'loadFont', 'deleteFont', 'exportFont',
      'addStroke', 'addAnchor', 'deleteSelected', 'flipH', 'flipV',
      'saveBubbleFont', 'loadBubbleFont', 'deleteBubbleFont', 'exportBubbleFont',
      'saveStyle', 'loadStyle', 'deleteStyle', 'exportStyle',
      // Style sliders are NOT intercepted — they are real tree transforms
      'savePage', 'loadPage', 'deletePage', 'exportPage',
    ];

    for (const name of knownNames) {
      it(`${name} returns true`, () => {
        const result = moritzFunctionCallHandler(makeCall(name, { name: 'x', id: 'x', value: 0 }));
        expect(result).toBe(true);
      });
    }
  });
});
