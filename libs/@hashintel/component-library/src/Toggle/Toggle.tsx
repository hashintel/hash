import {
  mix,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import React, { useEffect } from "react";
import { Filter } from "../lib/Filter";
import { LIP } from "../lib/surfaceEquations";

export interface ToggleProps {
  specularOpacity?: number;
  specularSaturation?: number;
  refractionLevel?: number;
  blurLevel?: number;
  forceActive?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  specularOpacity: specularOpacityProp = 0.5,
  specularSaturation: specularSaturationProp = 6,
  refractionLevel: refractionLevelProp = 1,
  blurLevel: blurLevelProp = 0.2,
  forceActive: forceActiveProp = false,
}) => {
  //
  // CONSTANTS (layout + optics)
  //
  const sliderHeight = 67;
  const sliderWidth = 160;
  const thumbWidth = 146;
  const thumbHeight = 92;
  const thumbRadius = thumbHeight / 2;
  const sliderRef = React.useRef<HTMLDivElement>(null);
  const blur = useMotionValue(blurLevelProp);
  const specularOpacity = useMotionValue(specularOpacityProp);
  const specularSaturation = useMotionValue(specularSaturationProp);
  const refractionBase = useMotionValue(refractionLevelProp);
  const xDragRatio = useMotionValue(0);

  const THUMB_REST_SCALE = 0.65;
  const THUMB_ACTIVE_SCALE = 0.9;

  const THUMB_REST_OFFSET = ((1 - THUMB_REST_SCALE) * thumbWidth) / 2;

  const TRAVEL =
    sliderWidth - sliderHeight - (thumbWidth - thumbHeight) * THUMB_REST_SCALE;

  //
  // MOTION SOURCES
  //
  const checked = useMotionValue(1);
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(forceActiveProp);
  const active = useTransform(() =>
    forceActive.get() || pointerDown.get() > 0.5 ? 1 : 0,
  );

  //
  // GLOBAL POINTER-UP LISTENER
  //
  useEffect(() => {
    const onPointerUp = (e: MouseEvent | TouchEvent) => {
      pointerDown.set(0);

      const x =
        e instanceof MouseEvent ? e.clientX : e.changedTouches[0]!.clientX;

      const distance = x - initialPointerX.get();
      if (Math.abs(distance) > 4) {
        const x = xDragRatio.get();
        const shouldBeChecked = x > 0.5;
        checked.set(shouldBeChecked ? 1 : 0);
      }
    };

    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
    return () => {
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
    };
  }, [pointerDown, checked]);

  //
  // UPDATE MOTION VALUES WHEN PROPS CHANGE
  //
  useEffect(() => {
    blur.set(blurLevelProp);
  }, [blurLevelProp, blur]);

  useEffect(() => {
    specularOpacity.set(specularOpacityProp);
  }, [specularOpacityProp, specularOpacity]);

  useEffect(() => {
    specularSaturation.set(specularSaturationProp);
  }, [specularSaturationProp, specularSaturation]);

  useEffect(() => {
    refractionBase.set(refractionLevelProp);
  }, [refractionLevelProp, refractionBase]);

  useEffect(() => {
    forceActive.set(forceActiveProp);
  }, [forceActiveProp, forceActive]);

  //
  // SPRINGS
  //
  const xRatio = useSpring(
    useTransform(() => {
      const c = checked.get();
      const dragRatio = xDragRatio.get();

      if (pointerDown.get() > 0.5) {
        return dragRatio;
      } else {
        return c ? 1 : 0;
      }
    }),
    { damping: 80, stiffness: 1000 },
  );
  const backgroundOpacity = useSpring(
    useTransform(active, (v) => 1 - 0.9 * v),
    { damping: 80, stiffness: 2000 },
  );
  const thumbScale = useSpring(
    useTransform(
      active,
      (v) => THUMB_REST_SCALE + (THUMB_ACTIVE_SCALE - THUMB_REST_SCALE) * v,
    ),
    { damping: 80, stiffness: 2000 },
  );
  const scaleRatio = useSpring(
    useTransform(() => (0.4 + 0.5 * active.get()) * refractionBase.get()),
  );
  const considerChecked = useTransform(() => {
    const x = xDragRatio.get();
    const c = checked.get();
    return pointerDown.get() ? (x > 0.5 ? 1 : 0) : c > 0.5 ? 1 : (0 as number);
  });

  const backgroundColor = useTransform(
    useSpring(considerChecked, { damping: 80, stiffness: 1000 }),
    mix("#94949F77", "#3BBF4EEE"),
  );

  const initialPointerX = useMotionValue(0);

  return (
    <div
      onMouseMove={(e) => {
        if (!sliderRef.current) return;
        e.stopPropagation();
        const baseRatio = checked.get();
        const clientX = e.clientX;
        const displacementX = clientX - initialPointerX.get();
        const ratio = baseRatio + displacementX / TRAVEL;
        const overflow = ratio < 0 ? -ratio : ratio > 1 ? ratio - 1 : 0;
        const overflowSign = ratio < 0 ? -1 : 1;
        const dampedOverflow = (overflowSign * overflow) / 22;
        xDragRatio.set(Math.min(1, Math.max(0, ratio)) + dampedOverflow);
      }}
      onTouchMove={(e) => {
        if (!sliderRef.current) return;
        e.stopPropagation();
        const baseRatio = checked.get();
        const clientX = e.touches[0]!.clientX;
        const displacementX = clientX - initialPointerX.get();
        const ratio = baseRatio + displacementX / TRAVEL;
        const overflow = ratio < 0 ? -ratio : ratio > 1 ? ratio - 1 : 0;
        const overflowSign = ratio < 0 ? -1 : 1;
        const dampedOverflow = (overflowSign * overflow) / 22;
        xDragRatio.set(Math.min(1, Math.max(0, ratio)) + dampedOverflow);
      }}
    >
      <motion.div
        ref={sliderRef}
        style={{
          display: "inline-block",
          width: sliderWidth,
          height: sliderHeight,
          backgroundColor: backgroundColor,
          borderRadius: sliderHeight / 2,
          position: "relative",
          cursor: "pointer",
        }}
        onClick={(e) => {
          const x = e.clientX;
          const initialX = initialPointerX.get();
          const distance = x - initialX;
          if (Math.abs(distance) < 4) {
            const shouldBeChecked = checked.get() < 0.5;
            checked.set(shouldBeChecked ? 1 : 0);
          }
        }}
      >
        <Filter
          id="thumb-filter"
          blur={blur}
          scaleRatio={scaleRatio}
          specularOpacity={specularOpacity}
          specularSaturation={specularSaturation}
          width={146}
          height={92}
          radius={46}
          bezelWidth={19}
          glassThickness={47}
          bezelHeightFn={LIP}
          refractiveIndex={1.5}
        />
        <motion.div
          className="absolute"
          onTouchStart={(e) => {
            e.stopPropagation();
            const pointerX = e.touches[0]!.clientX;
            pointerDown.set(1);
            initialPointerX.set(pointerX);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            pointerDown.set(1);
            initialPointerX.set(e.clientX);
          }}
          style={{
            position: "absolute",
            height: thumbHeight,
            width: thumbWidth,
            marginLeft:
              -THUMB_REST_OFFSET +
              (sliderHeight - thumbHeight * THUMB_REST_SCALE) / 2,
            x: useTransform(() => xRatio.get() * TRAVEL),
            y: "-50%",
            borderRadius: thumbRadius,
            top: sliderHeight / 2,
            backdropFilter: `url(#thumb-filter)`,
            scale: thumbScale,
            backgroundColor: useTransform(
              backgroundOpacity,
              (op) => `rgba(255, 255, 255, ${op})`,
            ),
            boxShadow: useTransform(() => {
              const isPressed = pointerDown.get() > 0.5;
              return (
                "0 4px 22px rgba(0,0,0,0.1)" +
                (isPressed
                  ? ", inset 2px 7px 24px rgba(0,0,0,0.09), inset -2px -7px 24px rgba(255,255,255,0.09)"
                  : "")
              );
            }),
          }}
        />
      </motion.div>
    </div>
  );
};
