import type { ImageData } from "canvas";
import type { MotionValue } from "motion/react";
import { motion, useTransform } from "motion/react";
import { memo } from "react";

import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "./displacement-map";
import { getDevicePixelRatio } from "./get-device-pixel-ratio";
import { imageDataToUrl } from "./image-data-to-url";
import { calculateSpecularImage } from "./specular";
import { CONVEX } from "./surface-equations";
import { useToMotion } from "./use-to-motion";

const LATERAL_PART_SIZE = 3; // 3 pixels for top/left/right/bottom parts

// Each part is a Base64-encoded PNG image
type Parts = {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
};

function splitImageDataToParts(
  imageData: ImageData,
  radius_: number,
  pixelRatio: number
): Parts {
  const radius = radius_ * pixelRatio;
  const lateralPartSize = LATERAL_PART_SIZE * pixelRatio;

  if (imageData.width !== radius * 2 + lateralPartSize) {
    throw new Error("ImageData width is too small for the given radius");
  }
  if (imageData.height !== imageData.width) {
    throw new Error("ImageData should be square");
  }

  const topLeft = imageDataToUrl(imageData, radius, radius, 0, 0);
  const top = imageDataToUrl(imageData, lateralPartSize, radius, radius, 0);
  const topRight = imageDataToUrl(
    imageData,
    radius,
    radius,
    radius + lateralPartSize,
    0
  );
  const left = imageDataToUrl(imageData, radius, lateralPartSize, 0, radius);
  const right = imageDataToUrl(
    imageData,
    radius,
    lateralPartSize,
    radius + lateralPartSize,
    radius
  );
  const bottomLeft = imageDataToUrl(
    imageData,
    radius,
    radius,
    0,
    radius + lateralPartSize
  );
  const bottom = imageDataToUrl(
    imageData,
    lateralPartSize,
    radius,
    radius,
    radius + lateralPartSize
  );
  const bottomRight = imageDataToUrl(
    imageData,
    radius,
    radius,
    radius + lateralPartSize,
    radius + lateralPartSize
  );

  return {
    topLeft,
    top,
    topRight,
    left,
    right,
    bottomLeft,
    bottom,
    bottomRight,
  };
}

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
  bezelHeightFn: (x: number) => number;
  pixelRatio: number;
};

type CompositePartsProps = {
  imageData: MotionValue<ImageData>;
  radius: MotionValue<number>;
  pixelRatio: number;
  width: MotionValue<number>;
  height: MotionValue<number>;
  result: string;
};

const CompositeParts: React.FC<CompositePartsProps> = memo(
  ({ imageData, radius, width, height, pixelRatio, result }) => {
    const parts = useTransform(() =>
      splitImageDataToParts(imageData.get(), radius.get(), pixelRatio)
    );

    return (
      <>
        <motion.feImage
          href={useTransform(parts, (_) => _.topLeft)}
          x={0}
          y={0}
          width={radius}
          height={radius}
          result={`${result}_topLeft`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.top)}
          x={radius}
          y={0}
          width={useTransform(() => width.get() - radius.get() * 2)}
          height={radius}
          result={`${result}_top`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.topRight)}
          x={useTransform(() => width.get() - radius.get())}
          y={0}
          width={radius}
          height={radius}
          result={`${result}_topRight`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.left)}
          x={0}
          y={radius}
          width={radius}
          height={useTransform(() => height.get() - radius.get() * 2)}
          result={`${result}_left`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.right)}
          x={useTransform(() => width.get() - radius.get())}
          y={radius}
          width={radius}
          height={useTransform(() => height.get() - radius.get() * 2)}
          result={`${result}_right`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottomLeft)}
          x={0}
          y={useTransform(() => height.get() - radius.get())}
          width={radius}
          height={radius}
          result={`${result}_bottomLeft`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottom)}
          x={radius}
          y={useTransform(() => height.get() - radius.get())}
          width={useTransform(() => width.get() - radius.get() * 2)}
          height={radius}
          result={`${result}_bottom`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottomRight)}
          x={useTransform(() => width.get() - radius.get())}
          y={useTransform(() => height.get() - radius.get())}
          width={radius}
          height={radius}
          result={`${result}_bottomRight`}
          preserveAspectRatio="none"
        />

        <motion.feFlood
          floodColor="rgb(128,128,128)"
          floodOpacity="0.5"
          result={`${result}_middle`}
        />
        <motion.feComposite
          in={`${result}_topLeft`}
          in2={`${result}_middle`}
          operator="over"
          result={`${result}_composite_0`}
        />
        <motion.feComposite
          in={`${result}_top`}
          in2={`${result}_composite_0`}
          operator="over"
          result={`${result}_composite_1`}
        />
        <motion.feComposite
          in={`${result}_topRight`}
          in2={`${result}_composite_1`}
          operator="over"
          result={`${result}_composite_2`}
        />
        <motion.feComposite
          in={`${result}_left`}
          in2={`${result}_composite_2`}
          operator="over"
          result={`${result}_composite_3`}
        />
        <motion.feComposite
          in={`${result}_right`}
          in2={`${result}_composite_3`}
          operator="over"
          result={`${result}_composite_4`}
        />
        <motion.feComposite
          in={`${result}_bottomLeft`}
          in2={`${result}_composite_4`}
          operator="over"
          result={`${result}_composite_5`}
        />
        <motion.feComposite
          in={`${result}_bottom`}
          in2={`${result}_composite_5`}
          operator="over"
          result={`${result}_composite_6`}
        />
        <motion.feComposite
          in={`${result}_bottomRight`}
          in2={`${result}_composite_6`}
          operator="over"
          result={result}
        />
      </>
    );
  }
);

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
    bezelHeightFn,
    pixelRatio,
  }) => {
    // Calculated image will always be a square that contains 4 corners + 3 pixels for middle
    const imageSide = useTransform(() => radius.get() * 2 + LATERAL_PART_SIZE);

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
      return calculateDisplacementMap({
        width: imageSide.get(),
        height: imageSide.get(),
        radius: radius.get(),
        bezelWidth: bezelWidth.get(),
        precomputedDisplacementMap: map.get(),
        maximumDisplacement: maximumDisplacement.get(),
        pixelRatio,
      });
    });

    const specularMap = useTransform(() => {
      return calculateSpecularImage({
        width: imageSide.get(),
        height: imageSide.get(),
        radius: radius.get(),
        specularAngle: Math.PI / 4, // Default angle, could be made configurable
        pixelRatio,
      });
    });

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

        <CompositeParts
          imageData={displacementMap}
          width={width}
          height={height}
          radius={radius}
          pixelRatio={pixelRatio}
          result="displacement_map"
        />

        <CompositeParts
          imageData={specularMap}
          width={width}
          height={height}
          radius={radius}
          pixelRatio={pixelRatio}
          result="specular_map"
        />

        <motion.feDisplacementMap
          in="blurred_source"
          in2="displacement_map"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced_source"
        />

        <motion.feComponentTransfer
          in="specular_map"
          result="specular_with_opacity"
        >
          <motion.feFuncA type="linear" slope={specularOpacity} />
        </motion.feComponentTransfer>

        <motion.feComposite
          in="specular_with_opacity"
          in2="displaced_source"
          operator="over"
          result="final_result"
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
  bezelHeightFn?: (x: number) => number;
  pixelRatio?: number;
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
    pixelRatio,
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
      pixelRatio={pixelRatio ?? getDevicePixelRatio()}
    />
  )
);
