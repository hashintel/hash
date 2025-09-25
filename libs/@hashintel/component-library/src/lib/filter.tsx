import type { MotionValue } from "motion/react";
import { motion, useTransform } from "motion/react";
import { memo } from "react";

import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "./displacement-map";
import { imageDataToUrl } from "./image-data-to-url";
import { calculateRefractionSpecular } from "./specular";
import { CONVEX } from "./surface-equations";
import { useDebounceMotionValue } from "./use-debounce-motion-value";
import { useToMotion } from "./use-to-motion";
import { getValueOrMotion } from "./use-value-or-motion";

//
// Internal Filter implementation.
// Exposed Filter API at bottom of file converts props to MotionValues and passes them here.
//

type FILTER_PROPS = {
  id: string;
  scaleRatio: MotionValue<number>;
  blur: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  radius: MotionValue<number>;
  glassThickness: MotionValue<number>;
  bezelWidth: MotionValue<number>;
  refractiveIndex: MotionValue<number>;
  specularOpacity: MotionValue<number>;
  specularSaturation: MotionValue<number>;
  dpr: number;
  bezelHeightFn?: (x: number) => number;
};

const FILTER: React.FC<FILTER_PROPS> = memo(
  ({
    id,
    width,
    height,
    radius,
    blur,
    glassThickness,
    bezelWidth,
    refractiveIndex,
    scaleRatio,
    specularOpacity,
    specularSaturation,
    bezelHeightFn = CONVEX,
    dpr = 2,
  }) => {
    const imageWidth = useDebounceMotionValue(width, 40);
    const imageHeight = useDebounceMotionValue(height, 40);

    const map = useTransform(() => {
      return calculateDisplacementMapRadius(
        glassThickness.get(),
        bezelWidth.get(),
        bezelHeightFn,
        refractiveIndex.get()
      );
    });

    const maximumDisplacement = useTransform(() =>
      Math.max(...map.get().map(Math.abs))
    );

    const displacementMap = useTransform(() => {
      return calculateDisplacementMap(
        imageWidth.get(),
        imageHeight.get(),
        radius.get(),
        bezelWidth.get(),
        maximumDisplacement.get(),
        map.get(),
        dpr
      );
    });

    const specularLayer = useTransform(() => {
      return calculateRefractionSpecular(
        imageWidth.get(),
        imageHeight.get(),
        radius.get(),
        50,
        undefined,
        dpr
      );
    });

    const displacementMapDataUrl = useTransform(
      displacementMap,
      imageDataToUrl
    );
    const specularLayerDataUrl = useTransform(specularLayer, imageDataToUrl);
    const scale = useTransform(
      () => maximumDisplacement.get() * scaleRatio.get()
    );

    const content = (
      <filter id={id}>
        <motion.feGaussianBlur
          in="SourceGraphic"
          stdDeviation={blur}
          result="blurred_source"
        />

        <motion.feImage
          href={displacementMapDataUrl}
          x={0}
          y={0}
          width={width}
          height={height}
          result="displacement_map"
          preserveAspectRatio="none"
        />

        <motion.feDisplacementMap
          in="blurred_source"
          in2="displacement_map"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced"
        />

        <motion.feColorMatrix
          in="displaced"
          type="saturate"
          // @ts-expect-error Fix `feColorMatrix` type, or use real matrix instead of type="saturate"
          values={useTransform(() => specularSaturation.get().toString())}
          result="displaced_saturated"
        />

        <motion.feImage
          href={specularLayerDataUrl}
          x={0}
          y={0}
          width={width}
          height={height}
          result="specular_layer"
          preserveAspectRatio="none"
        />

        <feComposite
          in="displaced_saturated"
          in2="specular_layer"
          operator="in"
          result="specular_saturated"
        />

        <feComponentTransfer in="specular_layer" result="specular_faded">
          <motion.feFuncA
            type="linear"
            slope={useTransform(() => getValueOrMotion(specularOpacity))}
          />
        </feComponentTransfer>

        <motion.feBlend
          in="specular_saturated"
          in2="displaced"
          mode="normal"
          result="withSaturation"
        />
        <motion.feBlend
          in="specular_faded"
          in2="withSaturation"
          mode="normal"
        />
      </filter>
    );

    return (
      <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
        <defs>{content}</defs>
      </svg>
    );
  }
);

//
// Exposed Filter API
// Converts props to MotionValues and passes them to Filter_ which does the actual work
//

type FilterProps = {
  id: string;
  scaleRatio?: number | MotionValue<number>;
  blur: number | MotionValue<number>;
  width: number | MotionValue<number>;
  height: number | MotionValue<number>;
  radius: number | MotionValue<number>;
  glassThickness: number | MotionValue<number>;
  bezelWidth: number | MotionValue<number>;
  refractiveIndex: number | MotionValue<number>;
  specularOpacity: number | MotionValue<number>;
  specularSaturation?: number | MotionValue<number>;
  dpr?: number;
  bezelHeightFn?: (x: number) => number;
};

export const Filter: React.FC<FilterProps> = memo(
  ({
    id,
    width,
    height,
    radius,
    blur,
    glassThickness,
    bezelWidth,
    refractiveIndex,
    scaleRatio = 1,
    specularOpacity,
    specularSaturation = 4,
    bezelHeightFn = CONVEX,
    dpr = 2,
  }) => (
    <FILTER
      id={id}
      width={useToMotion(width)}
      height={useToMotion(height)}
      radius={useToMotion(radius)}
      blur={useToMotion(blur)}
      glassThickness={useToMotion(glassThickness)}
      bezelWidth={useToMotion(bezelWidth)}
      refractiveIndex={useToMotion(refractiveIndex)}
      scaleRatio={useToMotion(scaleRatio)}
      specularOpacity={useToMotion(specularOpacity)}
      specularSaturation={useToMotion(specularSaturation)}
      bezelHeightFn={bezelHeightFn}
      dpr={dpr}
    />
  )
);
