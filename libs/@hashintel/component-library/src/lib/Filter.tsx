import { createCanvas, type ImageData } from "canvas";
import type { MotionValue } from "motion/react";
import { motion, useTransform } from "motion/react";

import {
  calculateDisplacementMap,
  calculateDisplacementMap2,
} from "./displacementMap";
import { calculateRefractionSpecular } from "./specular";
import { CONVEX } from "./surfaceEquations";
import { getValueOrMotion } from "./useValueOrMotion";

function imageDataToUrl(imageData: ImageData): string {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

type FilterProps = {
  id: string;
  scaleRatio?: MotionValue<number>;
  canvasWidth?: number;
  canvasHeight?: number;
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

export const Filter: React.FC<FilterProps> = ({
  id,
  canvasWidth,
  canvasHeight,
  width,
  height,
  radius,
  blur,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  scaleRatio,
  specularOpacity,
  specularSaturation = 4,
  bezelHeightFn = CONVEX,
  dpr,
}) => {
  const map = useTransform(() => {
    return calculateDisplacementMap(
      getValueOrMotion(glassThickness),
      getValueOrMotion(bezelWidth),
      bezelHeightFn,
      getValueOrMotion(refractiveIndex),
    );
  });

  const maximumDisplacement = useTransform(() =>
    Math.max(...map.get().map(Math.abs)),
  );

  const displacementMap = useTransform(() => {
    return calculateDisplacementMap2(
      getValueOrMotion(canvasWidth ?? width),
      getValueOrMotion(canvasHeight ?? height),
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      getValueOrMotion(bezelWidth),
      getValueOrMotion(maximumDisplacement),
      getValueOrMotion(map),
      dpr,
    );
  });

  const specularLayer = useTransform(() => {
    return calculateRefractionSpecular(
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      50,
      undefined,
      dpr,
    );
  });

  const displacementMapDataUrl = useTransform(() => {
    return imageDataToUrl(displacementMap.get());
  });
  const specularLayerDataUrl = useTransform(() => {
    return imageDataToUrl(specularLayer.get());
  });
  const scale = useTransform(
    () => maximumDisplacement.get() * (scaleRatio?.get() ?? 1),
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
        width={canvasWidth ?? width}
        height={canvasHeight ?? height}
        result="displacement_map"
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
        values={useTransform(() =>
          getValueOrMotion(specularSaturation).toString(),
        )}
        result="displaced_saturated"
      />

      <motion.feImage
        href={specularLayerDataUrl}
        x={0}
        y={0}
        width={canvasWidth ?? width}
        height={canvasHeight ?? height}
        result="specular_layer"
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
      <motion.feBlend in="specular_faded" in2="withSaturation" mode="normal" />
    </filter>
  );

  return (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>{content}</defs>
    </svg>
  );
};
