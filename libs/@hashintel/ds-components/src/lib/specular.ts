import { createImageData } from "canvas";

const NEAR_EDGE_DISTANCE = 20;

export function calculateSpecularImage(props: {
  width: number;
  height: number;
  radius: number;
  specularAngle: number;
  pixelRatio: number;
}) {
  const { pixelRatio, specularAngle } = props;

  const width = Math.round(props.width * pixelRatio);
  const height = Math.round(props.height * pixelRatio);
  const imageData = createImageData(width, height);

  const radius = Math.min(props.radius * pixelRatio, width / 2, height / 2);

  // Vector along which we should see specular
  const specular_vector = [
    Math.cos(specularAngle),
    Math.sin(specularAngle),
  ] as const;

  // Fill neutral color using buffer
  const neutral = 0x00000000;
  new Uint32Array(imageData.data.buffer).fill(neutral);

  const radiusSquared = radius ** 2;
  const radiusPlusOneSquared = (radius + 1) ** 2;
  const radiusMinusBezelSquared = (radius - NEAR_EDGE_DISTANCE) ** 2;

  const widthBetweenRadiuses = width - radius * 2;
  const heightBetweenRadiuses = height - radius * 2;

  for (let y1 = 0; y1 < height; y1++) {
    for (let x1 = 0; x1 < width; x1++) {
      const idx = (y1 * width + x1) * 4;

      const isOnLeftSide = x1 < radius;
      const isOnRightSide = x1 >= width - radius;
      const isOnTopSide = y1 < radius;
      const isOnBottomSide = y1 >= height - radius;

      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
        ? x1 - radius - widthBetweenRadiuses
        : 0;

      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
        ? y1 - radius - heightBetweenRadiuses
        : 0;

      const distanceToCenterSquared = x * x + y * y;

      const isInBezel =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusBezelSquared;

      // Process pixels that are in bezel or near bezel edge for anti-aliasing
      if (isInBezel) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;

        const opacity =
          distanceToCenterSquared <= radiusSquared
            ? 1
            : 1 -
              (distanceFromCenter - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));

        // Viewed from top
        const cos = x / distanceFromCenter;
        const sin = -y / distanceFromCenter;

        // Dot product of orientation
        const dotProduct = Math.abs(
          cos * specular_vector[0] + sin * specular_vector[1]
        );

        const coefficient =
          dotProduct *
          Math.sqrt(1 - (1 - distanceFromSide / (1 * pixelRatio)) ** 2);

        const color = 255 * coefficient;
        const finalOpacity = color * coefficient * opacity;

        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = finalOpacity;
      }
    }
  }
  return imageData;
}
