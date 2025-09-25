import { useMotionValue } from "motion/react";
import { useLayoutEffect } from "react";

import { Filter } from "../../lib/filter";
import { CONVEX } from "../../lib/surface-equations";
import { useMotionResizeObserver } from "../../lib/use-motion-resize-observer";

export type BarProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
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
  className,
  style,
  radius,
  blur,
  specularOpacity,
  specularSaturation,
  scaleRatio: scaleRatioProp,
  bezelWidth,
  glassThickness,
  refractiveIndex,
  children,
}) => {
  const scaleRatio = useMotionValue(scaleRatioProp);
  const {
    ref: divRef,
    width: trackedMotionWidth,
    height: trackedMotionHeight,
  } = useMotionResizeObserver<HTMLDivElement>({
    initialWidth: 10,
    initialHeight: 10,
  });

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
        width={trackedMotionWidth}
        height={trackedMotionHeight}
        radius={radius}
        bezelWidth={bezelWidth}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
      />
      <div
        ref={divRef}
        className={className}
        style={{
          ...style,
          borderRadius: radius,
          backdropFilter: `url(#bar-filter)`,
        }}
      >
        {children}
      </div>
    </>
  );
};
