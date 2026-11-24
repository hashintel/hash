/** The `matchMedia` stand-in jsdom lacks; `petrinaut-jsdom.ts` and the vitest setup files share it. */
export const installMatchMedia = () => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
};

/**
 * For the vitest setup files, which also run in Node-environment suites:
 * installs the stub only where a window lacks `matchMedia`.
 */
export const installMatchMediaIfMissing = () => {
  if (
    typeof window !== "undefined" &&
    typeof (window as Partial<Window>).matchMedia !== "function"
  ) {
    installMatchMedia();
  }
};
