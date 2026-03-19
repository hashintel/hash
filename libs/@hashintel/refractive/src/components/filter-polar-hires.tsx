import { calculateDisplacementMapRadius } from "../maps/displacement-map";
import { calculateGeometricPolarMap } from "../maps/geometric-polar-map";
import { splitImageDataToParts } from "../helpers/split-imagedata-to-parts";
import { buildCompositeSvgUrl } from "./composite-image";

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
 * Generate a space-separated string of `size` values from a mapping function,
 * suitable for SVG `feComponentTransfer` `tableValues`.
 */
function generateTableValues(
  size: number,
  fn: (index: number) => number,
): string {
  return Array.from({ length: size }, (_, i) => fn(i).toFixed(6)).join(" ");
}

// Trig tables are constant — computed once at module level.
const cosTable = generateTableValues(256, (i) => {
  const angle = (i / 255) * 2 * Math.PI;
  return (Math.cos(angle) + 1) / 2;
});

const sinTable = generateTableValues(256, (i) => {
  const angle = (i / 255) * 2 * Math.PI;
  return (Math.sin(angle) + 1) / 2;
});

/**
 * @private
 * Filter that reuses a single pre-computed hi-res (513×513) geometric polar field
 * for any radius. The hi-res map is computed with bezelWidth = radius (full corner).
 * When bezelWidth < radius, the magnitude table remaps the distance ratio by
 * `radius / bezelWidth` (capped at 1), compressing the bezel into a narrower band.
 *
 * The hi-res polar map and its 9-patch parts are computed once at module load.
 * On each render, only the SVG composite URL (positioning corners at the actual
 * radius) and the magnitude lookup table (encoding optical parameters) are
 * recomputed — both are cheap string operations.
 *
 * Uses `objectBoundingBox` filter units (no ResizeObserver needed).
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
  // Build composite SVG positioned at the actual radius (corners are hi-res,
  // browser downscales them to fit).
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

  // The hi-res map encodes ratio over the full radius (bezelWidth = radius).
  // When bezelWidth < radius, remap: the bezel occupies only the outer
  // (bezelWidth / radius) fraction of the corner, so we scale the ratio
  // by (radius / bezelWidth) and cap at 1. Anything beyond the bezel
  // gets the deepest displacement value.
  const ratioScale = clampedBezelWidth > 0 ? radius / clampedBezelWidth : 1;

  // Magnitude table: border distance ratio → signed normalized displacement.
  const magnitudeTable = generateTableValues(256, (i) => {
    if (i === 0 || maximumDisplacement === 0) {
      return 0.5;
    }
    const ratio = Math.min(1, (i / 255) * ratioScale);
    const sampleIndex = Math.min(
      Math.round(ratio * displacementRadius.length),
      displacementRadius.length - 1,
    );
    const displacement = displacementRadius[sampleIndex] ?? 0;
    return Math.max(
      0,
      Math.min(1, (displacement / maximumDisplacement + 1) / 2),
    );
  });

  const scale = 2 * maximumDisplacement * scaleRatio;

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>
        <filter id={id} x="0" y="0" width="1" height="1">
          {/* 1. Blur source graphic */}
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={blur}
            result="blurred_source"
          />

          {/* 2. Hi-res polar map, corners positioned at actual radius */}
          <feImage
            href={svgUrl}
            result="polar_map"
            preserveAspectRatio="none"
          />

          {/* 3. Copy angle (G) into R and G for trig lookup */}
          <feColorMatrix
            in="polar_map"
            type="matrix"
            values="0 1 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="angle_rg"
          />

          {/* 4. Apply cos table to R, sin table to G */}
          <feComponentTransfer in="angle_rg" result="trig">
            <feFuncR type="table" tableValues={cosTable} />
            <feFuncG type="table" tableValues={sinTable} />
          </feComponentTransfer>

          {/* 5. Copy distance ratio (R) into R and G for magnitude lookup */}
          <feColorMatrix
            in="polar_map"
            type="matrix"
            values="1 0 0 0 0  1 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="ratio_rg"
          />

          {/* 6. Apply optical transfer function (Snell's law) to both channels */}
          <feComponentTransfer in="ratio_rg" result="magnitude">
            <feFuncR type="table" tableValues={magnitudeTable} />
            <feFuncG type="table" tableValues={magnitudeTable} />
          </feComponentTransfer>

          {/* 7. Signed multiplication: magnitude × trig → displacement map */}
          <feComposite
            in="magnitude"
            in2="trig"
            operator="arithmetic"
            k1={2}
            k2={-1}
            k3={-1}
            k4={1}
            result="displacement_map"
          />

          {/* 8. Apply displacement */}
          <feDisplacementMap
            in="blurred_source"
            in2="displacement_map"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
};
