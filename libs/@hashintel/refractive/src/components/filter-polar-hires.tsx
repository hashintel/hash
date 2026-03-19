import { calculateDisplacementMapRadius } from "../maps/displacement-map";
import { calculateGeometricPolarMap } from "../maps/geometric-polar-map";
import { generateMagnitudeTable } from "../helpers/generate-table-values";
import { splitImageDataToParts } from "../helpers/split-imagedata-to-parts";
import { buildCompositeSvgUrl } from "./composite-image";
import { FilterShell } from "./filter-shell";
import { PolarToCartesian } from "./polar-to-cartesian";

/**
 * Reference radius used to generate the hi-res polar field.
 * The image is (REFERENCE_RADIUS * 2 + 1) = 513 pixels per side.
 * This is computed once and reused for any actual radius.
 */
const REFERENCE_RADIUS = 256;

/**
 * Pre-computed hi-res geometric polar field at 513×513 pixels.
 * Since bezelWidth = radius and the map encodes normalized values
 * (border distance ratio + angle), the same image works for any radius.
 */
const hiResPolarMap = calculateGeometricPolarMap({
  width: REFERENCE_RADIUS * 2 + 1,
  height: REFERENCE_RADIUS * 2 + 1,
  radius: REFERENCE_RADIUS,
  bezelWidth: REFERENCE_RADIUS,
  pixelRatio: 1,
});

/**
 * Pre-split 9-patch parts from the hi-res polar map.
 * These are sliced at the reference resolution (256px corners)
 * and can be positioned at any target radius in the SVG.
 */
const hiResParts = splitImageDataToParts({
  imageData: hiResPolarMap,
  cornerWidth: REFERENCE_RADIUS,
  pixelRatio: 1,
});

type FilterPolarHiResProps = {
  id: string;
  scaleRatio: number;
  blur: number;
  radius: number;
  glassThickness: number;
  bezelWidth: number;
  refractiveIndex: number;
  bezelHeightFn: (x: number) => number;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * @private
 * Pre-computed hi-res polar map + SVG filter math.
 *
 * Reuses a single 513×513 geometric polar field for any radius.
 * On each render, only the SVG composite URL (positioning corners at the
 * actual radius) and the magnitude lookup table (encoding optical parameters)
 * are recomputed — both are cheap string operations.
 *
 * Uses objectBoundingBox — auto-sizes with the element, no ResizeObserver.
 */
export const FilterPolarHiRes: React.FC<FilterPolarHiResProps> = ({
  id,
  radius,
  blur,
  scaleRatio,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  bezelHeightFn,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  const svgUrl = buildCompositeSvgUrl(
    hiResParts,
    radius,
    hideTop,
    hideBottom,
    hideLeft,
    hideRight,
  );

  const clampedBezelWidth = Math.min(bezelWidth, radius);

  const displacementRadius = calculateDisplacementMapRadius(
    glassThickness,
    clampedBezelWidth,
    bezelHeightFn,
    refractiveIndex,
  );

  const maximumDisplacement = Math.max(...displacementRadius.map(Math.abs));
  const ratioScale = clampedBezelWidth > 0 ? radius / clampedBezelWidth : 1;
  const magnitudeTable = generateMagnitudeTable(
    displacementRadius,
    maximumDisplacement,
    ratioScale,
  );

  return (
    <FilterShell
      id={id}
      blur={blur}
      scale={2 * maximumDisplacement * scaleRatio}
      obb
    >
      <feImage href={svgUrl} result="polar_map" preserveAspectRatio="none" />
      <PolarToCartesian
        magnitudeTable={magnitudeTable}
        in="polar_map"
        result="displacement_map"
      />
    </FilterShell>
  );
};
