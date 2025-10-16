import { createImageData } from "canvas";

import { calculateCircleMap } from "./calculate-circle-map";
import type { ProcessPixelFunction } from "./process-pixel";

/**
 * Generates a circular (or rounded rectangle) map and allows processing of each pixel.
 * Used by Diplacement and Specular maps.
 */
export function calculateRoundedSquareMap(props: {
  width: number;
  height: number;
  radius: number;
  fillColor: number;
  /** Restricts pixel processing to a certain distance from the border. */
  maximumDistanceToBorder?: number;
  processPixel: ProcessPixelFunction;
}) {
  if (
    props.maximumDistanceToBorder === undefined ||
    props.maximumDistanceToBorder <= props.radius
  ) {
    return calculateCircleMap(props);
  }

  const { fillColor, processPixel } = props;

  const width = Math.round(props.width);
  const height = Math.round(props.height);
  const imageData = createImageData(width, height);

  // Fill buffer with base color
  new Uint32Array(imageData.data.buffer).fill(fillColor);

  const radius = Math.min(props.radius, width / 2, height / 2);
  const cornerWidth = Math.max(
    radius,
    Math.min(props.maximumDistanceToBorder ?? 0, width / 2, height / 2),
  );

  const widthBetweenCorners = width - cornerWidth * 2;
  const heightBetweenCorners = height - cornerWidth * 2;

  // Calculate radiusPlusOne to antialias the border (1 pixel outside)
  const radiusPlusOne = radius + 1;
  const radiusPlusOneSquared = radiusPlusOne ** 2;

  const angleStart = Math.atan2(cornerWidth - radius, cornerWidth);
  const angleEnd = Math.atan2(cornerWidth, cornerWidth - radius);
  const aperture = angleEnd - angleStart;

  for (let y1 = 0; y1 < height; y1++) {
    for (let x1 = 0; x1 < width; x1++) {
      const idx = (y1 * width + x1) * 4;

      const isOnLeftSide = x1 < cornerWidth;
      const isOnRightSide = x1 >= width - cornerWidth;
      const isOnTopSide = y1 < cornerWidth;
      const isOnBottomSide = y1 >= height - cornerWidth;

      // Virtual x value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const x = isOnLeftSide
        ? x1 - cornerWidth
        : isOnRightSide
          ? x1 - cornerWidth - widthBetweenCorners
          : 0;

      // Virtual y value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const y = isOnTopSide
        ? y1 - cornerWidth
        : isOnBottomSide
          ? y1 - cornerWidth - heightBetweenCorners
          : 0;

      const pointAngleInSquare = Math.atan2(Math.abs(y), Math.abs(x));

      function calculateBorderIntersection() {
        if (
          pointAngleInSquare <= angleStart ||
          pointAngleInSquare >= angleEnd
        ) {
          // Outside the cone
          if (Math.abs(y) > Math.abs(x)) {
            return [
              Math.abs(x / y) * cornerWidth * Math.sign(x),
              cornerWidth * Math.sign(y),
            ] as const;
          } else {
            return [
              cornerWidth * Math.sign(x),
              Math.abs(y / x) * cornerWidth * Math.sign(y),
            ] as const;
          }
        } else {
          // Inside the cone
          const pointAngleInCone =
            (pointAngleInSquare - angleStart) / (aperture / (Math.PI / 2));

          const intersectionX = Math.cos(pointAngleInCone);
          const intersectionY = Math.sin(pointAngleInCone);

          return [
            (cornerWidth - radius + intersectionX * radius) * Math.sign(x),
            (cornerWidth - radius + intersectionY * radius) * Math.sign(y),
          ] as const;
        }
      }

      // Find the intersection point on the border of the rounded square
      const [intersectionX, intersectionY] = calculateBorderIntersection();

      const distanceToCenterSquared = x * x + y * y;
      const distanceToBorderSquared =
        (intersectionX - x) ** 2 + (intersectionY - y) ** 2;

      // If the pixel is within corner square containing the quarter circle
      const isInRadiusSquare =
        Math.abs(x) > cornerWidth - radius &&
        Math.abs(y) > cornerWidth - radius;

      // If the pixel is within corner square, but outside the quarter circle
      const isOutsideRadius =
        isInRadiusSquare &&
        (Math.abs(x) - (cornerWidth - radius)) ** 2 +
          (Math.abs(y) - (cornerWidth - radius)) ** 2 >=
          radiusPlusOneSquared;

      const isInRoundedSquare = !isInRadiusSquare || !isOutsideRadius;

      // Process pixels that are in rounded square or near bezel edge for anti-aliasing
      if (isInRoundedSquare) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromBorder = Math.sqrt(distanceToBorderSquared);
        const distanceFromBorderRatio =
          distanceFromBorder / (distanceFromCenter + distanceFromBorder);
        const angle = Math.atan2(y, x);
        const opacity = isOutsideRadius ? 1 - distanceFromBorder : 1;

        processPixel(
          x,
          y,
          imageData.data,
          idx,
          distanceFromCenter,
          distanceFromBorder,
          distanceFromBorderRatio,
          angle,
          opacity,
        );
      }
    }
  }

  return imageData;
}
