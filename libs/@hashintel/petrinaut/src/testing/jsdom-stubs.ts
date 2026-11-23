/**
 * Browser APIs jsdom does not implement, as no-ops, for every test file that
 * runs in jsdom. A test that needs one to report or answer differently stubs
 * it itself.
 */
class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}

if (typeof window !== "undefined") {
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = NoObserver as unknown as typeof ResizeObserver;
  }
  if (!("IntersectionObserver" in globalThis)) {
    globalThis.IntersectionObserver =
      NoObserver as unknown as typeof IntersectionObserver;
  }
  if (!("matchMedia" in globalThis)) {
    globalThis.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof matchMedia;
  }
}
