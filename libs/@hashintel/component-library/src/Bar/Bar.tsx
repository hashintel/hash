import { useMotionValue } from "motion/react";
import React, { useLayoutEffect } from "react";
import { Filter } from "../lib/Filter";
import { CONVEX } from "../lib/surfaceEquations";

export type BarProps = React.PropsWithChildren<{
  width: number;
  height: number;
  radius: number;
  blur: number;
  specularOpacity: number;
  specularSaturation: number;
  scaleRatio: number;
}>;

export const Bar: React.FC<BarProps> = ({
  width,
  height,
  radius,
  blur,
  specularOpacity,
  specularSaturation,
  scaleRatio: scaleRatioProp,
}) => {
  const scaleRatio = useMotionValue(scaleRatioProp);
  useLayoutEffect(() => {
    scaleRatio.set(scaleRatioProp);
  }, [scaleRatioProp]);

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
        bezelWidth={16}
        glassThickness={80}
        refractiveIndex={1.45}
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
      ></div>
    </>
  );
};
