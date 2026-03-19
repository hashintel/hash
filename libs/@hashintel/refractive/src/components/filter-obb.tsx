import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../maps/displacement-map";
import { CompositeImage } from "./composite-image";
import { FilterShell } from "./filter-shell";

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
 * Rasterized displacement map + SVG composite image (CompositeImage).
 * Uses objectBoundingBox — auto-sizes with the element, no ResizeObserver.
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
  const cornerWidth = Math.max(radius, bezelWidth);
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

  return (
    <FilterShell
      id={id}
      blur={blur}
      scale={maximumDisplacement * scaleRatio}
      obb
    >
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
    </FilterShell>
  );
};
