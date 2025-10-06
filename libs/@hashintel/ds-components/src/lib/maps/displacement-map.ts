/* eslint-disable id-length */
/* eslint-disable no-param-reassign */
import { calculateCircleMap } from "./calculate-circle-map";

export function calculateDisplacementMapRadius(
  glassThickness: number = 200,
  bezelWidth: number = 50,
  bezelHeightFn: (x: number) => number = (x) => x,
  refractiveIndex: number = 1.5,
  samples: number = 128,
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

export function calculateDisplacementMap(props: {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  maximumDisplacement: number;
  precomputedDisplacementMap: number[];
  pixelRatio: number;
}) {
  const { pixelRatio, maximumDisplacement, precomputedDisplacementMap } = props;

  const width = Math.round(props.width * pixelRatio);
  const height = Math.round(props.height * pixelRatio);

  const radius = Math.min(props.radius * pixelRatio, width / 2, height / 2);
  const bezel = Math.min(props.bezelWidth * pixelRatio, radius - 1);

  return calculateCircleMap({
    width,
    height,
    radius,
    maximumDistanceToBorder: bezel,
    fillColor: 0xff008080,
    processPixel(x, y, buffer, offset, distanceFromCenter, opacity) {
      const distanceFromSide = radius - distanceFromCenter;

      // Viewed from top
      const cos = x / distanceFromCenter;
      const sin = y / distanceFromCenter;

      const bezelIndex = Math.round(
        (distanceFromSide / bezel) * precomputedDisplacementMap.length,
      );
      const distance = precomputedDisplacementMap[bezelIndex] ?? 0;

      const dX = (-cos * distance) / maximumDisplacement;
      const dY = (-sin * distance) / maximumDisplacement;

      buffer[offset] = 128 + dX * 127 * opacity; // R
      buffer[offset + 1] = 128 + dY * 127 * opacity; // G
      buffer[offset + 2] = 0; // B
      buffer[offset + 3] = 255; // A
    },
  });
}
