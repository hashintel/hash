import { useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import { useGlassFinish } from "./glass-finish";

/** The corner radius shared by every glass segment of the bar. */
export const GLASS_RADIUS = 8;

/**
 * The refraction the Chromium finish applies. The 3px blur is part of the
 * refracted look, not the fallback blur, and matches what the bar showed
 * before the finish was split by browser.
 */
const REFRACTION = {
  radius: GLASS_RADIUS,
  blur: 3,
  bezelWidth: 20,
  glassThickness: 100,
};

const surfaceStyle = css({
  position: "relative",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  transition: "[box-shadow 0.3s ease]",
  _hover: {
    boxShadow: "[0 4px 13px rgba(0, 0, 0, 0.15)]",
  },
});

/**
 * The two finishes are layers under the fill rather than a filter on the
 * segment itself, so one can hand over to the other. A layer that fades
 * composites its filtered backdrop at its opacity, which is what lets the
 * blur dissolve into the refraction instead of switching.
 */
const layerStyle = {
  position: "absolute",
  inset: "[0]",
  borderRadius: "[inherit]",
  pointerEvents: "none",
  animationDuration: "[0.4s]",
  animationTimingFunction: "[ease]",
  animationFillMode: "both",
} as const;

const blurLayerStyle = cva({
  base: {
    ...layerStyle,
    backdropFilter: "[blur(14px) saturate(1.4)]",
  },
  variants: {
    handingOver: {
      true: { animationName: "fadeOut" },
    },
  },
});

const refractiveLayerStyle = css({
  ...layerStyle,
  animationName: "fadeIn",
});

const fillStyle = css({
  position: "relative",
  padding: "1",
  borderRadius: "[inherit]",
  backgroundColor: "white.a95",
  transition: "[background-color 0.3s ease]",
  // Stays on one line: Panda writes the key into the class name, and a
  // wrapped one stops matching the rule it generated.
  "[data-glass]:hover &": {
    backgroundColor: "white.a110",
  },
});

/**
 * One glass segment of the bar.
 *
 * Every browser paints the blurred backdrop first. Where the browser can also
 * refract it, the refraction fades in over 0.4s while the blur fades out, so
 * the segment settles into the refractive finish rather than popping into it.
 */
export const GlassSurface: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const finish = useGlassFinish();
  const isRefractive = finish === "refractive";
  // Once the blur has faded behind the refraction it is only a filter the
  // compositor keeps running at zero opacity, so it goes.
  const [isBlurRetired, setBlurRetired] = useState(false);

  return (
    <div
      data-glass={finish}
      className={surfaceStyle}
      style={{ borderRadius: GLASS_RADIUS }}
    >
      {isBlurRetired ? null : (
        <div
          className={blurLayerStyle({ handingOver: isRefractive })}
          onAnimationEnd={isRefractive ? () => setBlurRetired(true) : undefined}
        />
      )}
      {isRefractive ? (
        <refractive.div
          className={refractiveLayerStyle}
          refraction={REFRACTION}
        />
      ) : null}
      <div className={fillStyle}>{children}</div>
    </div>
  );
};
