/* eslint-disable no-param-reassign */
import { calculateRoundedSquareMap } from "./calculate-rounded-square-map";

export function calculatePolarDistanceMap(props: {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
  precomputedDisplacementMap: number[];
  pixelRatio: number;
}) {
  const { pixelRatio, precomputedDisplacementMap } = props;

  const width = Math.round(props.width * pixelRatio);
  const height = Math.round(props.height * pixelRatio);

  const radius = Math.min(props.radius * pixelRatio, width / 2, height / 2);
  const bezel = Math.min(props.bezelWidth * pixelRatio, width / 2, height / 2);

  return calculateRoundedSquareMap({
    width,
    height,
    radius,
    maximumDistanceToBorder: bezel,
    // R=0 (no distance), G=0, B=0, A=255
    fillColor: 0xff000000,
    processPixel(
      _x,
      _y,
      buffer,
      offset,
      _distanceFromCenter,
      distanceFromBorder,
      distanceFromBorderRatio,
      angle,
      opacity,
    ) {
      const ratio =
        bezel > radius ? distanceFromBorderRatio : distanceFromBorder / bezel;

      const bezelIndex = Math.round(ratio * precomputedDisplacementMap.length);
      const distance = Math.abs(precomputedDisplacementMap[bezelIndex] ?? 0);

      // Red: distance in pixels, clamped to [0, 255]
      buffer[offset] = Math.min(255, Math.round(distance * opacity));

      // Green: displacement angle mapped from [0, 2π] to [0, 255]
      // Displacement direction is opposite to position angle (toward center)
      const displacementAngle = (angle + Math.PI) % (2 * Math.PI);
      buffer[offset + 1] = Math.round(
        (displacementAngle / (2 * Math.PI)) * 255,
      );

      buffer[offset + 2] = 0; // B
      buffer[offset + 3] = 255; // A
    },
  });
}
