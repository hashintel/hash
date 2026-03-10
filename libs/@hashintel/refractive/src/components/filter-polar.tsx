import { calculateDisplacementMapRadius } from "../maps/displacement-map";
import { calculatePolarDistanceMap } from "../maps/polar-distance-map";
import { CompositeImage } from "./composite-image";

type FilterPolarProps = {
  id: string;
  blur: number;
  radius: number;
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  bezelHeightFn: (x: number) => number;
  pixelRatio: number;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * @private
 * Filter that displays a polar distance map (distance + angle) instead of applying displacement.
 *
 * The polar distance map encodes:
 * - Red channel: displacement distance in pixels, clamped to [0, 255]
 * - Green channel: displacement angle mapped from [0, 2π] to [0, 255]
 *
 * Uses objectBoundingBox sizing via a composite SVG data URL (no ResizeObserver needed).
 * Does not apply displacement or specular — just shows the raw polar map.
 */
export const FilterPolar: React.FC<FilterPolarProps> = ({
  id,
  radius,
  blur,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  bezelHeightFn,
  pixelRatio,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  const cornerWidth = Math.max(radius, bezelWidth);
  const imageSide = cornerWidth * 2 + 1;

  const map = calculateDisplacementMapRadius(
    glassThickness,
    bezelWidth,
    bezelHeightFn,
    refractiveIndex,
  );

  const polarMap = calculatePolarDistanceMap({
    width: imageSide,
    height: imageSide,
    radius,
    bezelWidth,
    precomputedDisplacementMap: map,
    pixelRatio,
  });

  const content = (
    <filter id={id} x="0" y="0" width="1" height="1">
      <feGaussianBlur
        in="SourceGraphic"
        stdDeviation={blur}
        result="blurred_source"
      />

      <CompositeImage
        imageData={polarMap}
        cornerWidth={cornerWidth}
        pixelRatio={pixelRatio}
        result="polar_map"
        hideTop={hideTop}
        hideBottom={hideBottom}
        hideLeft={hideLeft}
        hideRight={hideRight}
      />
    </filter>
  );

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>{content}</defs>
    </svg>
  );
};
