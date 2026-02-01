import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfills for Radix UI and standard browser APIs missing in JSDOM
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

window.matchMedia = window.matchMedia || function() {
  return {
    matches: false,
    addListener: function() {},
    removeListener: function() {}
  };
};

// PointerEvent polyfill (Radix relies on this)
if (!window.PointerEvent) {
    // @ts-ignore
    window.PointerEvent = class PointerEvent extends Event {};
}

// ScrollIntoView mock
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn();

