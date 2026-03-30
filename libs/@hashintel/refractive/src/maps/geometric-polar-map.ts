/* eslint-disable no-param-reassign */
import { calculateRoundedSquareMap } from "./calculate-rounded-square-map";

/**
 * Computes a geometry-only polar field encoding (distance-to-border ratio, angle)
 * for each pixel of a rounded rectangle.
 *
 * The output image is (radius * 2 + 1) pixels per side, with the bezel filling
 * the entire corner area. The actual bezel-to-radius ratio is handled later
 * by the magnitude lookup table's `ratioScale` parameter.
 *
 * This map depends only on shape geometry, NOT on optical parameters
 * (glassThickness, refractiveIndex, bezelHeightFn). The optical transfer
 * function is applied later via SVG feComponentTransfer lookup tables.
 *
 * Channel encoding:
 * - R: border distance ratio [0, 1] → [0, 255], where 0 = at border, 255 = deep inside bezel
 * - G: angle toward center mapped from [0, 2π] to [0, 255]
 * - B: 0
 * - A: 255
 */
export function calculateGeometricPolarMap(radius: number) {
  const side = radius * 2 + 1;

  return calculateRoundedSquareMap({
    width: side,
    height: side,
    radius,
    maximumDistanceToBorder: radius,
    // R=0 (at border), G=0, B=0, A=255
    fillColor: 0xff000000,
    processPixel(
      _x,
      _y,
      buffer,
      offset,
      _distanceFromCenter,
      _distanceFromBorder,
      distanceFromBorderRatio,
      angle,
      opacity,
    ) {
      // R: border distance ratio, scaled by opacity for anti-aliasing.
      // At opacity < 1 (anti-aliased edges), ratio trends toward 0,
      // which the magnitude lookup table maps to "no displacement".
      buffer[offset] = Math.round(distanceFromBorderRatio * 255 * opacity);

      // G: angle toward center (displacement direction)
      const displacementAngle = (angle + Math.PI) % (2 * Math.PI);
      buffer[offset + 1] = Math.round(
        (displacementAngle / (2 * Math.PI)) * 255,
      );

      buffer[offset + 2] = 0; // B
      buffer[offset + 3] = 255; // A
    },
  });
}
