import type { Parts } from "../helpers/split-imagedata-to-parts";
import { buildCompositeSvgUrl } from "./composite/image";
import { CompositeParts } from "./composite/parts";
import { Refraction } from "./refraction";

export type CompositeMode = "image" | "parts";

type FilterShellProps = {
  id: string;
  blur: number;
  scale: number;
  magnitudeTable: string;
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
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * @private
 * Full SVG filter pipeline: blur → polar map compositing → refraction effect.
 *
 * The `compositing` prop controls how the 9-patch polar map is assembled
 * inside the SVG filter graph. The polar map is then consumed by the
 * Refraction effect (and in the future, other effects like specular).
 */
export const FilterShell: React.FC<FilterShellProps> = ({
  id,
  blur,
  scale,
  magnitudeTable,
  parts,
  cornerWidth,
  compositing = "image",
  elementRef,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
  const isImage = compositing === "image";

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
            result="refracted"
          />
        </filter>
      </defs>
    </svg>
  );
};
