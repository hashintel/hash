import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../maps/displacement-map";
import { calculateSpecularImage } from "../maps/specular";
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
  specularOpacity: number;
  specularAngle: number;
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
  specularOpacity,
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
    radius: radius,
    bezelWidth: bezelWidth,
    precomputedDisplacementMap: map,
    maximumDisplacement: maximumDisplacement,
    pixelRatio,
  });

  const specularMap = calculateSpecularImage({
    width: imageSide,
    height: imageSide,
    radius: radius,
    specularAngle: Math.PI / 4, // Default angle, could be made configurable
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

      <CompositeParts
        imageData={specularMap}
        width={width}
        height={height}
        cornerWidth={cornerWidth}
        pixelRatio={pixelRatio}
        result="specular_map"
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
        result="displaced_source"
      />

      <feColorMatrix
        in="specular_map"
        type="luminanceToAlpha"
        result="specular_alpha"
      />

      <feComponentTransfer in="specular_alpha" result="specular_with_opacity">
        <feFuncA type="linear" slope={specularOpacity} />
      </feComponentTransfer>

      <feFlood floodColor="white" result="white_layer" />

      <feComposite
        in="white_layer"
        in2="specular_with_opacity"
        operator="in"
        result="masked_specular"
      />

      <feComposite
        in="masked_specular"
        in2="displaced_source"
        operator="over"
      />
    </filter>
  );

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>{content}</defs>
    </svg>
  );
};
