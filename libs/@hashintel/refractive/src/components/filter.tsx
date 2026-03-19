import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../maps/displacement-map";
import { CompositeParts } from "./composite-parts";

type FilterProps = {
  id: string;
  scaleRatio: number;
  blur: number;
  width: number;
  height: number;
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
 * Creates an SVG containing a filter that can be used as `backdrop-filter`to create a refractive effect.
 *
 * At the moment, width and height need to be explicitly provided to match the size of element it will be applied to.
 *
 * Usage:
 * ```tsx
 * const filterId = "my-refractive-filter";
 *
 * <Filter id={filterId} {...otherProps} />
 * <div style={{ backdropFilter: `url(#${filterId})` }} />
 * ```
 *
 * @param props - The properties for the Filter component.
 * @returns An SVG element containing the filter definition.
 */
export const Filter: React.FC<FilterProps> = ({
  id,
  width,
  height,
  radius,
  blur,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  scaleRatio,
  bezelHeightFn,
  pixelRatio,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  // Size of each corner area
  // If bezelWidth < radius, corners will be in a circle shape
  // If bezelWidth >= radius, corners will be in a rounded square shape
  const cornerWidth = Math.max(radius, bezelWidth);

  // Calculated image width and height are always odd,
  // so we always have at least 1 pixel in the middle we can stretch
  const imageSide = cornerWidth * 2 + 1;

  const map = calculateDisplacementMapRadius(
    glassThickness,
    bezelWidth,
    bezelHeightFn,
    refractiveIndex,
  );

  const maximumDisplacement = Math.max(...map.map(Math.abs));

  const displacementMap = calculateDisplacementMap({
    width: imageSide,
    height: imageSide,
    radius,
    bezelWidth,
    precomputedDisplacementMap: map,
    maximumDisplacement,
    pixelRatio,
  });

  const scale = maximumDisplacement * scaleRatio;

  const content = (
    <filter id={id}>
      <feGaussianBlur
        in="SourceGraphic"
        stdDeviation={blur}
        result="blurred_source"
      />

      <CompositeParts
        imageData={displacementMap}
        width={width}
        height={height}
        cornerWidth={cornerWidth}
        pixelRatio={pixelRatio}
        result="displacement_map"
        hideTop={hideTop}
        hideBottom={hideBottom}
        hideLeft={hideLeft}
        hideRight={hideRight}
      />

      <feDisplacementMap
        in="blurred_source"
        in2="displacement_map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>{content}</defs>
    </svg>
  );
};
