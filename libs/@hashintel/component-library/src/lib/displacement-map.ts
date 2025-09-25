/* eslint-disable id-length */
import { createImageData } from "canvas";

export function calculateDisplacementMapRadius(
  glassThickness: number = 200,
  bezelWidth: number = 50,
  bezelHeightFn: (x: number) => number = (x) => x,
  refractiveIndex: number = 1.5,
  samples: number = 128
): number[] {
  // Pre-calculate the distance the ray will be deviated
  // given the distance to border (ratio of bezel)
  // and height of the glass
  const eta = 1 / refractiveIndex;

  // Simplified refraction, which only handles fully vertical incident ray [0, 1]
  function refract(normalX: number, normalY: number): [number, number] | null {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
      // Total internal reflection
      return null;
    }
    const kSqrt = Math.sqrt(k);
    return [
      -(eta * dot + kSqrt) * normalX,
      eta - (eta * dot + kSqrt) * normalY,
    ] as const;
  }

  return Array.from({ length: samples }, (_, i) => {
    const x = i / samples;
    const y = bezelHeightFn(x);

    // Calculate derivative in x
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = bezelHeightFn(x + dx);
    const derivative = (y2 - y) / dx;
    const magnitude = Math.sqrt(derivative * derivative + 1);
    const normal = [-derivative / magnitude, -1 / magnitude] as const;
    const refracted = refract(normal[0], normal[1]);

    if (!refracted) {
      return 0;
    } else {
      const remainingHeightOnBezel = y * bezelWidth;
      const remainingHeight = remainingHeightOnBezel + glassThickness;

      // Return displacement (rest of travel on x-axis, depends on remaining height to hit bottom of glass)
      return refracted[0] * (remainingHeight / refracted[1]);
    }
  });
}

export function calculateDisplacementMap(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  maximumDisplacement: number,
  precomputedDisplacementMap: number[] = [],
  dpr?: number
) {
  const devicePixelRatio =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1);
  const bufferWidth = objectWidth * devicePixelRatio;
  const bufferHeight = objectHeight * devicePixelRatio;
  const imageData = createImageData(bufferWidth, bufferHeight);

  // Fill neutral color using buffer
  const neutral = 0xff008080;
  new Uint32Array(imageData.data.buffer).fill(neutral);

  const radius_ = radius * devicePixelRatio;
  const bezel = bezelWidth * devicePixelRatio;

  const radiusSquared = radius_ ** 2;
  const radiusPlusOneSquared = (radius_ + 1) ** 2;
  const radiusMinusBezelSquared = (radius_ - bezel) ** 2;

  const objectWidth_ = objectWidth * devicePixelRatio;
  const objectHeight_ = objectHeight * devicePixelRatio;
  const widthBetweenRadiuses = objectWidth_ - radius_ * 2;
  const heightBetweenRadiuses = objectHeight_ - radius_ * 2;

  const objectX = (bufferWidth - objectWidth_) / 2;
  const objectY = (bufferHeight - objectHeight_) / 2;

  for (let y1 = 0; y1 < objectHeight_; y1++) {
    for (let x1 = 0; x1 < objectWidth_; x1++) {
      const idx = ((objectY + y1) * bufferWidth + objectX + x1) * 4;

      const isOnLeftSide = x1 < radius_;
      const isOnRightSide = x1 >= objectWidth_ - radius_;
      const isOnTopSide = y1 < radius_;
      const isOnBottomSide = y1 >= objectHeight_ - radius_;

      const x = isOnLeftSide
        ? x1 - radius_
        : isOnRightSide
        ? x1 - radius_ - widthBetweenRadiuses
        : 0;

      const y = isOnTopSide
        ? y1 - radius_
        : isOnBottomSide
        ? y1 - radius_ - heightBetweenRadiuses
        : 0;

      const distanceToCenterSquared = x * x + y * y;

      const isInBezel =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusBezelSquared;

      // Only write non-neutral displacements (when isInBezel)
      if (isInBezel) {
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (Math.sqrt(distanceToCenterSquared) - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));

        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius_ - distanceFromCenter;

        // Viewed from top
        const cos = x / distanceFromCenter;
        const sin = y / distanceFromCenter;

        const bezelIndex =
          ((distanceFromSide / bezel) * precomputedDisplacementMap.length) | 0;
        const distance = precomputedDisplacementMap[bezelIndex] ?? 0;

        const dX = (-cos * distance) / maximumDisplacement;
        const dY = (-sin * distance) / maximumDisplacement;

        imageData.data[idx] = 128 + dX * 127 * opacity; // R
        imageData.data[idx + 1] = 128 + dY * 127 * opacity; // G
        imageData.data[idx + 2] = 0; // B
        imageData.data[idx + 3] = 255; // A
      }
    }
  }
  return imageData;
}
