import { useSyncExternalStore } from "react";

/**
 * How the bar's glass is rendered: the backdrop refracted through an SVG
 * filter, or plainly blurred.
 */
export type GlassFinish = "blur" | "refractive";

/** What the detection reads off `navigator`. */
export interface NavigatorHints {
  readonly userAgent: string;
  readonly userAgentData?: {
    readonly brands: ReadonlyArray<{ readonly brand: string }>;
  };
}

/**
 * Only Chromium paints an SVG filter given to `backdrop-filter`. Safari and
 * Firefox accept the declaration and render nothing behind it, so the support
 * cannot be asked of `CSS.supports` and is read off the browser instead.
 *
 * Every Chromium brand qualifies, Edge and Brave included: the capability is
 * the engine's. Chrome on iOS is WebKit underneath and reports `CriOS`, so it
 * gets the blur like Safari.
 */
export const detectGlassFinish = (hints: NavigatorHints): GlassFinish => {
  const brands = hints.userAgentData?.brands;
  if (brands !== undefined) {
    return brands.some(({ brand }) => /chromium|google chrome/i.test(brand))
      ? "refractive"
      : "blur";
  }
  return /Chrome\/\d/.test(hints.userAgent) && !/CriOS\//.test(hints.userAgent)
    ? "refractive"
    : "blur";
};

const detectedFinish: GlassFinish =
  typeof navigator === "undefined"
    ? "blur"
    : detectGlassFinish(navigator as NavigatorHints);

const subscribeToNothing = () => () => {};

/**
 * The finish this browser can render. Read as an external value so a server
 * render or a hydration pass starts from the blur every browser can paint, and
 * the refraction arrives with the client.
 */
export const useGlassFinish = (): GlassFinish =>
  useSyncExternalStore(
    subscribeToNothing,
    () => detectedFinish,
    () => "blur",
  );
