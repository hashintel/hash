import { css, cx } from "@hashintel/ds-helpers/css";

import { useMotionResizeObserver } from "../use-motion-resize-observer";

export type RefractivePaneProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  radius: number;
  blur: number;
  specularOpacity: number;
  scaleRatio: number;
  bezelWidth: number;
  glassThickness: number;
  refractiveIndex: number;
}>;

export const RefractivePane: React.FC<RefractivePaneProps> = ({
  className,
  style,
  radius,
  blur,
  // specularOpacity,
  // scaleRatio,
  // bezelWidth,
  // glassThickness,
  // refractiveIndex,
  children,
}) => {
  // const filterId = `bar-filter-${useId()}`;
  const {
    ref: divRef,
    // width: trackedMotionWidth,
    // height: trackedMotionHeight,
  } = useMotionResizeObserver<HTMLDivElement>({
    initialWidth: 10,
    initialHeight: 10,
  });

  return (
    <div
      className={cx(css({ position: "relative" }), className)}
      style={{
        ...style,
        borderRadius: radius,
      }}
    >
      {/* <Filter
        id={filterId}
        blur={0}
        scaleRatio={scaleRatio}
        specularOpacity={specularOpacity}
        width={trackedMotionWidth}
        height={trackedMotionHeight}
        radius={radius}
        bezelWidth={bezelWidth}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
      /> */}

      <div
        ref={divRef}
        style={{
          zIndex: -1,
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          borderRadius: radius,
          backdropFilter: `blur(${blur}px)`,
        }}
      />

      {children}
    </div>
  );
};
