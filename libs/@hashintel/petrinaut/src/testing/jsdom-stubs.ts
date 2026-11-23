/**
 * Browser APIs jsdom does not implement, as no-ops, for every test file that
 * runs in jsdom. A test that needs one to report or answer differently stubs
 * it itself. jsdom lists `matchMedia` on the window with no value, so each is
 * installed where it is missing, not where its name is absent.
 */
class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}

const jsdomWindow: Partial<typeof globalThis> = globalThis;

if (typeof window !== "undefined") {
  jsdomWindow.ResizeObserver ??= NoObserver as unknown as typeof ResizeObserver;
  jsdomWindow.IntersectionObserver ??=
    NoObserver as unknown as typeof IntersectionObserver;
  jsdomWindow.matchMedia ??= ((query: string) => ({
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
