import type { Parts } from "../helpers/split-imagedata-to-parts";
import { buildCompositeSvgUrl } from "./composite/image";
import { CompositeParts } from "./composite/parts";
import { DiffuseReflection } from "./effects/diffuse-reflection";
import { Refraction } from "./effects/refraction";
import { SpecularRim } from "./effects/specular-rim";

export type CompositeMode = "image" | "parts";

type FilterShellProps = {
  id: string;
  blur: number;
  scale: number;
  magnitudeTable: string;
  surfaceTiltTable: string;
  parts: Parts;
  cornerWidth: number;
  /**
   * Compositing strategy for the polar map:
   * - `"image"` (default): Builds a single composite SVG data URL.
   *   Uses objectBoundingBox — auto-sizes with the element, no ResizeObserver needed.
   * - `"parts"`: Renders 9 feImage + 8 feComposite filter primitives.
   *   Observes the element via `elementRef` to get pixel dimensions.
   */
  compositing?: CompositeMode;
  /** Ref to the element whose dimensions drive the "parts" layout. Required when compositing is "parts". */
  elementRef?: React.RefObject<HTMLElement | null>;
  /** Light direction in radians. Enables diffuse and specular effects. */
  lightAngle?: number;
  /** Strength of diffuse reflection shading [0,1]. 0 or undefined disables. */
  diffuseIntensity?: number;
  /** Whether to enable the specular rim highlight. Requires lightAngle. */
  specular?: boolean;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * @private
 * Full SVG filter pipeline: blur → polar map compositing → effects.
 *
 * Effect chain: refraction → diffuse reflection → specular rim.
 * Each effect consumes the shared polar map independently.
 */
export const FilterShell: React.FC<FilterShellProps> = ({
  id,
  blur,
  scale,
  magnitudeTable,
  surfaceTiltTable,
  parts,
  cornerWidth,
  compositing = "image",
  elementRef,
  lightAngle,
  diffuseIntensity,
  specular,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  const isImage = compositing === "image";
  const hasDiffuse =
    lightAngle !== undefined &&
    diffuseIntensity !== undefined &&
    diffuseIntensity > 0;
  const hasSpecular = specular !== false && lightAngle !== undefined;

  // Build the effect chain: refraction → diffuse → specular
  // Each effect reads "polar_map" and takes the previous result as source.
  const refractionResult = "refracted";
  const diffuseResult = hasDiffuse ? "with_diffuse" : refractionResult;
  const specularResult = hasSpecular ? "with_specular" : diffuseResult;
  // The last enabled effect's result is used as the filter output.
  // SVG uses the last result in the filter chain automatically.
  void specularResult; // referenced implicitly by the filter

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>
        <filter
          id={id}
          {...(isImage ? { x: "0", y: "0", width: "1", height: "1" } : {})}
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={blur}
            result="blurred_source"
          />

          {isImage ? (
            <feImage
              href={buildCompositeSvgUrl(
                parts,
                cornerWidth,
                hideTop,
                hideBottom,
                hideLeft,
                hideRight,
              )}
              preserveAspectRatio="none"
              result="polar_map"
            />
          ) : (
            <CompositeParts
              parts={parts}
              elementRef={elementRef!}
              cornerWidth={cornerWidth}
              hideTop={hideTop}
              hideBottom={hideBottom}
              hideLeft={hideLeft}
              hideRight={hideRight}
              result="polar_map"
            />
          )}

          <Refraction
            magnitudeTable={magnitudeTable}
            scale={scale}
            in="polar_map"
            source="blurred_source"
            result={refractionResult}
          />

          {hasDiffuse && (
            <DiffuseReflection
              in="polar_map"
              source={refractionResult}
              lightAngle={lightAngle}
              surfaceTiltTable={surfaceTiltTable}
              intensity={diffuseIntensity}
              result={diffuseResult}
            />
          )}

          {hasSpecular && (
            <SpecularRim
              in="polar_map"
              source={diffuseResult}
              radius={cornerWidth}
              lightAngle={lightAngle}
              result={specularResult}
            />
          )}
        </filter>
      </defs>
    </svg>
  );
};
