import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "../maps/displacement-map";
import { CompositeParts } from "./composite-parts";
import { FilterShell } from "./filter-shell";

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
 * Rasterized displacement map + JavaScript compositing (CompositeParts).
 * Requires explicit width/height (needs ResizeObserver in the HOC).
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
    <FilterShell id={id} blur={blur} scale={maximumDisplacement * scaleRatio}>
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
    </FilterShell>
  );
};
