/**
 * For now we only rely on frontend detection to see if the browser is compatible with Liquid Glass effects.
 * Currently, only Chromium-based browsers (Chrome, Edge, Opera) are supported.
 * Firefox and Safari have limited or no support for the required CSS features.
 *
 * This also means we are not able for now to prepare server-side rendering for these effects.
 */
export function useIsLiquidGlassCompatible(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const isChromiumBased = /Chrome|Chromium|Edg|OPR/.test(ua);
  return isChromiumBased;
}
