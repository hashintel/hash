import { createImageData } from "canvas";

type ProcessPixelFunction = (
  x: number,
  y: number,
  buffer: Uint8ClampedArray<ArrayBufferLike>,
  offset: number,
  distanceFromCenter: number,
  distanceFromBorder: number,
  distanceFromBorderRatio: number,
  /**
   * Angle from center to pixel in radians.
   */
  angle: number,
  opacity: number
) => void;

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
  const { fillColor, processPixel } = props;

  const width = Math.round(props.width);
  const height = Math.round(props.height);
  const imageData = createImageData(width, height);

  // Fill buffer with base color
  new Uint32Array(imageData.data.buffer).fill(fillColor);

  const radius = Math.min(props.radius, width / 2, height / 2);
  const cornerWidth = Math.max(
    radius,
    Math.min(props.maximumDistanceToBorder ?? 0, width / 2, height / 2)
  );

  const widthBetweenCorners = width - cornerWidth * 2;
  const heightBetweenCorners = height - cornerWidth * 2;

  const radiusSquared = radius ** 2;
  const radiusPlusOneSquared = (radius + 1) ** 2;
  const radiusMinusBezelSquared =
    cornerWidth < radius ? (radius - cornerWidth) ** 2 : 0;

  // In case of rounded square, we need to handle corners differently
  const isRoundedSquare = cornerWidth > radius;

  if (isRoundedSquare) {
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

        const [intersectionX, intersectionY] = calculateBorderIntersection();
        const distanceToCenterSquared = x * x + y * y;
        const distanceToBorderSquared =
          (intersectionX - x) ** 2 + (intersectionY - y) ** 2;

        const isInRadiusSquare =
          Math.abs(x) > cornerWidth - radius &&
          Math.abs(y) > cornerWidth - radius;
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

          const opacity = !isOutsideRadius ? 1 : 0; // TODO: Handle opacity
          // : 1 -
          //   (distanceFromCenter - Math.sqrt(radiusSquared)) /
          //     (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));

          processPixel(
            x,
            y,
            imageData.data,
            idx,
            distanceFromCenter,
            distanceFromBorder,
            distanceFromBorderRatio,
            angle,
            opacity
          );
        }
      }
    }
  } else {
    // Simple circle case
    for (let y1 = 0; y1 < height; y1++) {
      for (let x1 = 0; x1 < width; x1++) {
        const idx = (y1 * width + x1) * 4;

        const isOnLeftSide = x1 < radius;
        const isOnRightSide = x1 >= width - radius;
        const isOnTopSide = y1 < radius;
        const isOnBottomSide = y1 >= height - radius;

        // Virtual x value
        // When not on sides, value is 0 to stretch circle into rounded rectangle.
        const x = isOnLeftSide
          ? x1 - radius
          : isOnRightSide
          ? x1 - radius - widthBetweenCorners
          : 0;

        // Virtual y value
        // When not on sides, value is 0 to stretch circle into rounded rectangle.
        const y = isOnTopSide
          ? y1 - radius
          : isOnBottomSide
          ? y1 - radius - heightBetweenCorners
          : 0;

        const distanceToCenterSquared = x * x + y * y;

        const isInBezel =
          distanceToCenterSquared <= radiusPlusOneSquared &&
          distanceToCenterSquared >= radiusMinusBezelSquared;

        // Process pixels that are in bezel or near bezel edge for anti-aliasing
        if (isInBezel) {
          const distanceFromCenter = Math.sqrt(distanceToCenterSquared);

          const distanceFromBorder = radius - distanceFromCenter;

          const distanceFromBorderRatio = distanceFromBorder / radius;

          const angle = Math.atan2(y, x);

          const opacity =
            distanceToCenterSquared <= radiusSquared
              ? 1
              : 1 -
                (distanceFromCenter - Math.sqrt(radiusSquared)) /
                  (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));

          processPixel(
            x,
            y,
            imageData.data,
            idx,
            distanceFromCenter,
            distanceFromBorder,
            distanceFromBorderRatio,
            angle,
            opacity
          );
        }
      }
    }
  }

  return imageData;
}
