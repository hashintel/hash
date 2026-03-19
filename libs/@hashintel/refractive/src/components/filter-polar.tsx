import { calculateDisplacementMapRadius } from "../maps/displacement-map";
import { calculateGeometricPolarMap } from "../maps/geometric-polar-map";
import { CompositeImage } from "./composite-image";

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
 * Generate a space-separated string of `size` values from a mapping function,
 * suitable for SVG `feComponentTransfer` `tableValues`.
 */
function generateTableValues(
  size: number,
  fn: (index: number) => number,
): string {
  return Array.from({ length: size }, (_, i) => fn(i).toFixed(6)).join(" ");
}

/**
 * @private
 * Filter that uses polar coordinate indirection to decouple shape geometry
 * from the optical transfer function.
 *
 * Instead of computing a full displacement bitmap per parameter change, this filter:
 * 1. Rasterizes a geometry-only polar field (border distance ratio + angle toward center).
 *    This depends only on shape (radius, bezelWidth), not optical parameters.
 * 2. Applies the optical transfer function (Snell's law refraction) via an SVG
 *    `feComponentTransfer` lookup table — a cheap update when parameters change.
 * 3. Converts polar (magnitude, angle) → cartesian (dx, dy) via SVG filter math:
 *    `feColorMatrix` to separate channels, `feComponentTransfer` for cos/sin tables,
 *    and `feComposite` arithmetic for signed multiplication.
 *
 * The polar field bitmap is reusable across changes to optical parameters
 * (glassThickness, refractiveIndex, bezelHeightFn). Only the lookup table
 * values need to change.
 *
 * Uses `objectBoundingBox` filter units (no ResizeObserver needed).
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

  // --- Geometry-only polar map (reusable across optical parameter changes) ---
  const polarMap = calculateGeometricPolarMap({
    width: imageSide,
    height: imageSide,
    radius,
    bezelWidth,
    pixelRatio,
  });

  // --- Optical transfer function (encoded as SVG lookup tables) ---
  const displacementRadius = calculateDisplacementMapRadius(
    glassThickness,
    bezelWidth,
    bezelHeightFn,
    refractiveIndex,
  );

  const maximumDisplacement = Math.max(...displacementRadius.map(Math.abs));

  // Magnitude table: border distance ratio → signed normalized displacement.
  // Maps [0, 1] (ratio) through the Snell's law displacement curve,
  // then normalizes to [0, 1] centered at 0.5 (where 0.5 = no displacement).
  // Index 0 is forced to 0.5 so fill-color pixels produce no displacement.
  const magnitudeTable = generateTableValues(256, (i) => {
    if (i === 0 || maximumDisplacement === 0) {
      return 0.5;
    }
    const ratio = i / 255;
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

  // Trig tables: angle index [0..255] → cos/sin mapped to [0, 1] centered at 0.5.
  const cosTable = generateTableValues(256, (i) => {
    const angle = (i / 255) * 2 * Math.PI;
    return (Math.cos(angle) + 1) / 2;
  });

  const sinTable = generateTableValues(256, (i) => {
    const angle = (i / 255) * 2 * Math.PI;
    return (Math.sin(angle) + 1) / 2;
  });

  // Scale factor accounts for the signed-multiplication encoding:
  // the effective max displacement from feComposite arithmetic is ±0.5,
  // so we double the scale to compensate.
  const scale = 2 * maximumDisplacement * scaleRatio;

  const hideProps = { hideTop, hideBottom, hideLeft, hideRight };

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

          {/* 2. Composite the geometry-only polar map (R=ratio, G=angle) */}
          <CompositeImage
            imageData={polarMap}
            cornerWidth={cornerWidth}
            pixelRatio={pixelRatio}
            result="polar_map"
            {...hideProps}
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

          {/* 7. Signed multiplication: magnitude × trig → displacement map.
              For two signed values centered at 0.5 (a_signed = 2a−1, b_signed = 2b−1):
              result = (a_signed × b_signed + 1) / 2 = 2ab − a − b + 1
              So: k1=2, k2=−1, k3=−1, k4=1 */}
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
