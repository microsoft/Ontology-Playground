import '@testing-library/jest-dom/vitest';

// Recent Node/jsdom combinations may expose no persistent localStorage backing
// store to workers. The application already handles unavailable storage, but
// token-flow tests need deterministic browser-like storage semantics.
const values = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return values.size;
  },
  clear() {
    values.clear();
  },
  getItem(key) {
    return values.get(String(key)) ?? null;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  removeItem(key) {
    values.delete(String(key));
  },
  setItem(key, value) {
    values.set(String(key), String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });
Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage });
