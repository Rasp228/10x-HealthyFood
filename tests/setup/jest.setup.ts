/// <reference types="jest" />
import "@testing-library/jest-dom";

// Polyfill dla Node.js APIs w środowisku testowym
import { TextEncoder, TextDecoder } from "util";

// Dodaj polyfill dla TextEncoder/TextDecoder
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextDecoder = TextDecoder as any;
}

// Globalne mocki dla Astro/browser APIs
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock dla IntersectionObserver
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).IntersectionObserver = class MockIntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {
    // Mock constructor
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  observe(_target: Element) {
    // Mock method
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unobserve(_target: Element) {
    // Mock method
  }
  disconnect() {
    // Mock method
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  get root() {
    return null;
  }
  get rootMargin() {
    return "0px";
  }
  get thresholds() {
    return [];
  }
};

// Mock dla ResizeObserver
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).ResizeObserver = class MockResizeObserver {
  constructor(public callback: ResizeObserverCallback) {
    // Mock constructor
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  observe(_target: Element) {
    // Mock method
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unobserve(_target: Element) {
    // Mock method
  }
  disconnect() {
    // Mock method
  }
};

// Console warnings dla rozwoju - można wyłączyć w CI
if (process.env.NODE_ENV === "test") {
  // Wyłącz niektóre console.warn w testach
  const originalWarn = console.warn;
  beforeAll(() => {
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("React has detected a change in the order of Hooks")) {
        return;
      }
      originalWarn.call(console, ...args);
    };
  });

  afterAll(() => {
    console.warn = originalWarn;
  });
}

// Zwiększ timeout dla testów integracyjnych
jest.setTimeout(10000);
