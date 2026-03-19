import { calculateDisplacementMapRadius } from "../maps/displacement-map";
import { calculateGeometricPolarMap } from "../maps/geometric-polar-map";
import { generateMagnitudeTable } from "../helpers/generate-table-values";
import { CompositeImage } from "./composite-image";
import { FilterShell } from "./filter-shell";
import { PolarToCartesian } from "./polar-to-cartesian";

type FilterPolarProps = {
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
 * Polar distance map + SVG filter math + SVG composite image (CompositeImage).
 *
 * Rasterizes a geometry-only polar field (reusable across optical parameter
 * changes), then applies the optical transfer function and polar→cartesian
 * conversion entirely in the SVG filter graph.
 *
 * Uses objectBoundingBox — auto-sizes with the element, no ResizeObserver.
 */
export const FilterPolar: React.FC<FilterPolarProps> = ({
  id,
  radius,
  blur,
  scaleRatio,
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

  const polarMap = calculateGeometricPolarMap({
    width: imageSide,
    height: imageSide,
    radius,
    bezelWidth,
    pixelRatio,
  });

  const displacementRadius = calculateDisplacementMapRadius(
    glassThickness,
    bezelWidth,
    bezelHeightFn,
    refractiveIndex,
  );

  const maximumDisplacement = Math.max(...displacementRadius.map(Math.abs));
  const magnitudeTable = generateMagnitudeTable(
    displacementRadius,
    maximumDisplacement,
  );

  return (
    <FilterShell
      id={id}
      blur={blur}
      scale={2 * maximumDisplacement * scaleRatio}
      obb
    >
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
      <PolarToCartesian
        magnitudeTable={magnitudeTable}
        in="polar_map"
        result="displacement_map"
      />
    </FilterShell>
  );
};
