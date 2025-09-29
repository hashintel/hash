// Most devices have a device pixel ratio of 2 (e.g., Retina displays)
const DEFAULT_PIXEL_RATIO = 2;

/**
 * Retrieves the device pixel ratio, defaulting to a predefined value if not available.
 *
 * @returns The device pixel ratio, or a default value if not available.
 */
export function getDevicePixelRatio(): number {
  return typeof window !== "undefined"
    ? window.devicePixelRatio
    : DEFAULT_PIXEL_RATIO;
}
