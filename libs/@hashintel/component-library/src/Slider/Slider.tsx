import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import React, { useEffect, useRef } from "react";
import { Filter } from "../lib/Filter";
import { CONVEX } from "../lib/surfaceEquations";

export interface SliderProps {
  min?: number;
  max?: number;
  defaultValue?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  refractionLevel?: number;
  blurLevel?: number;
  forceActive?: boolean;
  onChange?: (value: number) => void;
}

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  defaultValue = 10,
  specularOpacity: specularOpacityProp = 0.4,
  specularSaturation: specularSaturationProp = 7,
  refractionLevel: refractionLevelProp = 1,
  blurLevel: blurLevelProp = 0,
  forceActive: forceActiveProp = false,
  onChange,
}) => {
  const value = useMotionValue(defaultValue);

  const sliderHeight = 14;
  const sliderWidth = 330;

  // Use numeric MotionValue (0/1) instead of boolean for compatibility with transforms
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(forceActiveProp);

  const isUp = useTransform((): number =>
    forceActive.get() || pointerDown.get() > 0.5 ? 1 : 0
  );

  const thumbWidth = 90;
  const thumbHeight = 60;
  const thumbRadius = 30;
  // MotionValue-based controls
  const blur = useMotionValue(blurLevelProp); // 0..40
  const specularOpacity = useMotionValue(specularOpacityProp); // 0..1
  const specularSaturation = useMotionValue(specularSaturationProp); // 0..50
  const refractionBase = useMotionValue(refractionLevelProp); // 0..1
  const pressMultiplier = useTransform(isUp, [0, 1], [0.4, 0.9]);
  const scaleRatio = useSpring(
    useTransform(
      [pressMultiplier, refractionBase],
      ([m, base]) => (Number(m) || 0) * (Number(base) || 0)
    )
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const SCALE_REST = 0.6;
  const SCALE_DRAG = 1;
  const thumbWidthRest = thumbWidth * SCALE_REST;

  const scaleSpring = useSpring(
    useTransform(isUp, [0, 1], [SCALE_REST, SCALE_DRAG]),
    {
      damping: 80,
      stiffness: 2000,
    }
  );

  const backgroundOpacity = useSpring(useTransform(isUp, [0, 1], [1, 0.1]), {
    damping: 80,
    stiffness: 2000,
  });

  // End drag when releasing outside the element
  useEffect(() => {
    function onPointerUp() {
      pointerDown.set(0);
    }
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
    };
  }, []);

  // UPDATE MOTION VALUES WHEN PROPS CHANGE
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

  useEffect(() => {
    value.set(defaultValue);
  }, [defaultValue, value]);

  // CALL ONCHANGE WHEN VALUE CHANGES
  useEffect(() => {
    const unsubscribe = value.on("change", (v) => {
      onChange?.(v);
    });
    return unsubscribe;
  }, [value, onChange]);

  return (
    <motion.div
      style={{
        position: "relative",
        width: sliderWidth,
        height: thumbHeight,
      }}
    >
      <motion.div
        ref={trackRef}
        style={{
          display: "inline-block",
          width: sliderWidth,
          height: sliderHeight,
          left: 0,
          top: (thumbHeight - sliderHeight) / 2,
          backgroundColor: "#89898F66",
          borderRadius: sliderHeight / 2,
          position: "absolute",
          cursor: "pointer",
        }}
        onMouseDown={() => {
          pointerDown.set(1);
        }}
        onMouseUp={() => {
          pointerDown.set(0);
        }}
      >
        <div className="w-full h-full overflow-hidden rounded-full">
          <motion.div
            style={{
              top: 0,
              left: 0,
              height: sliderHeight,
              width: useTransform(value, (v) => `${v}%`),
              borderRadius: 6,
              backgroundColor: "#0377F7",
            }}
          />
        </div>
      </motion.div>

      <Filter
        id="thumb-filter-slider"
        blur={blur}
        scaleRatio={scaleRatio}
        specularOpacity={specularOpacity}
        specularSaturation={specularSaturation}
        width={90}
        height={60}
        radius={30}
        bezelWidth={16}
        glassThickness={80}
        refractiveIndex={1.45}
        bezelHeightFn={CONVEX}
      />

      <motion.div
        ref={thumbRef}
        drag="x"
        dragConstraints={{
          left: -thumbWidthRest / 3,
          right: sliderWidth - thumbWidth + thumbWidthRest / 3,
        }}
        dragElastic={0.02}
        onMouseDown={() => {
          pointerDown.set(1);
        }}
        onMouseUp={() => {
          pointerDown.set(0);
        }}
        onDragStart={() => {
          pointerDown.set(1);
        }}
        onDrag={(_) => {
          const track = trackRef.current!.getBoundingClientRect();
          const thumb = thumbRef.current!.getBoundingClientRect();

          const x0 = track.left + thumbWidthRest / 2;
          const x100 = track.right - thumbWidthRest / 2;

          const trackInsideWidth = x100 - x0;

          const thumbCenterX = thumb.left + thumb.width / 2;

          const x = Math.max(x0, Math.min(x100, thumbCenterX));
          const ratio = (x - x0) / trackInsideWidth;

          value.set(Math.max(min, Math.min(max, ratio * (max - min) + min)));
        }}
        onDragEnd={() => {
          pointerDown.set(0);
        }}
        dragMomentum={false}
        className="absolute"
        style={{
          height: thumbHeight,
          width: thumbWidth,
          top: 0,
          borderRadius: thumbRadius,
          backdropFilter: `url(#thumb-filter-slider)`,
          scale: scaleSpring,
          cursor: "pointer",

          backgroundColor: useTransform(
            backgroundOpacity,
            (op) => `rgba(255, 255, 255, ${op})`
          ),
          boxShadow: "0 3px 14px rgba(0,0,0,0.1)",
        }}
      />
    </motion.div>
  );
};
