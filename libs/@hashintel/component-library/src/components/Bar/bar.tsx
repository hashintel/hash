import { useMotionValue } from "motion/react";
import { useLayoutEffect } from "react";

import { Filter } from "../../lib/filter_";
import { CONVEX } from "../../lib/surface-equations";

export type BarProps = React.PropsWithChildren<{
  width: number;
  height: number;
  radius: number;
  blur: number;
  specularOpacity: number;
  specularSaturation: number;
  scaleRatio: number;
  bezelWidth: number;
  glassThickness: number;
  refractiveIndex: number;
}>;

export const Bar: React.FC<BarProps> = ({
  width,
  height,
  radius,
  blur,
  specularOpacity,
  specularSaturation,
  scaleRatio: scaleRatioProp,
  bezelWidth,
  glassThickness,
  refractiveIndex,
}) => {
  const scaleRatio = useMotionValue(scaleRatioProp);
  useLayoutEffect(() => {
    scaleRatio.set(scaleRatioProp);
  }, [scaleRatio, scaleRatioProp]);

  return (
    <>
      <Filter
        id="bar-filter"
        blur={blur}
        scaleRatio={scaleRatio}
        specularOpacity={specularOpacity}
        specularSaturation={specularSaturation}
        width={width}
        height={height}
        radius={radius}
        bezelWidth={bezelWidth}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
      />
      <div
        style={{
          width,
          height,
          borderRadius: radius,
          boxShadow: "0 3px 14px rgba(0,0,0,0.1)",
          backdropFilter: `url(#bar-filter)`,
        }}
      />
    </>
  );
};
