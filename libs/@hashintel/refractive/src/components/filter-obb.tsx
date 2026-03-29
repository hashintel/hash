import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../maps/displacement-map";
import { CompositeImage } from "./composite-image";

type FilterOBBProps = {
  id: string;
  scaleRatio: number;
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
 * Alternative filter that uses `objectBoundingBox` to automatically size itself.
 *
 * Instead of requiring explicit width/height and a ResizeObserver, this filter:
 * - Sets the filter region to exactly match the element's bounding box (`x="0" y="0" width="1" height="1"`)
 * - Uses a single feImage per map (displacement) referencing SVG data URLs
 * - The SVG data URLs contain all 9 image parts composited via nested SVGs with percentage positioning
 *
 * Usage:
 * ```tsx
 * const filterId = "my-refractive-filter";
 *
 * <FilterOBB id={filterId} {...otherProps} />
 * <div style={{ backdropFilter: `url(#${filterId})` }} />
 * ```
 *
 * @param props - The properties for the FilterOBB component.
 * @returns An SVG element containing the filter definition.
 */
export const FilterOBB: React.FC<FilterOBBProps> = ({
  id,
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
    <filter id={id} x="0" y="0" width="1" height="1">
      <feGaussianBlur
        in="SourceGraphic"
        stdDeviation={blur}
        result="blurred_source"
      />

      <CompositeImage
        imageData={displacementMap}
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
