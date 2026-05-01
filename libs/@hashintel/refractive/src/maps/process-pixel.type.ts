export type ProcessPixelFunction = (
  x: number,
  y: number,
  buffer: Uint8ClampedArray<ArrayBufferLike>,
  offset: number,
  distanceFromCenter: number,
  distanceToBorder: number,
  distanceToBorderRatio: number,
  /**
   * Angle from center to pixel in radians.
   */
  angle: number,
  opacity: number,
) => void;
