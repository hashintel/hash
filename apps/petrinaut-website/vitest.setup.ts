/**
 * Petrinaut's UI entry probes `matchMedia` while its modules load, which jsdom
 * does not implement; every test that renders the shared chat loads it.
 */
const lacksMatchMedia =
  typeof window !== "undefined" &&
  typeof (window as Partial<Window>).matchMedia !== "function";

if (lacksMatchMedia) {
  window.matchMedia = (media: string): MediaQueryList => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
}
