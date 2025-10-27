import type { ImageData } from "canvas";
import type { MotionValue } from "motion/react";
import { motion, useTransform } from "motion/react";
import { memo } from "react";

import { getDevicePixelRatio } from "./get-device-pixel-ratio";
import { imageDataToUrl } from "./image-data-to-url";
import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from "./maps/displacement-map";
import { calculateSpecularImage } from "./maps/specular";
import { CONVEX } from "./surface-equations";
import { useToMotion } from "./use-to-motion";

const LATERAL_PART_SIZE = 1; // 1 pixel for top/left/right/bottom parts

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

//
// Splits an ImageData into 8 parts and returns them as Base64-encoded PNG images.
// The parts can then be rendered and composited together to form a scalable image with correct corners and edges.
//

function splitImageDataToParts(props: {
  imageData: ImageData;
  cornerWidth: number;
  pixelRatio: number;
}): Parts {
  const { imageData } = props;
  const cornerWidth = props.cornerWidth * props.pixelRatio;
  const lateralPartSize = LATERAL_PART_SIZE * props.pixelRatio;

  if (imageData.width !== cornerWidth * 2 + lateralPartSize) {
    throw new Error("ImageData width is too small for the given corner width");
  }
  if (imageData.height !== imageData.width) {
    throw new Error("ImageData should be square");
  }

  const topLeft = imageDataToUrl(imageData, cornerWidth, cornerWidth, 0, 0);
  const top = imageDataToUrl(
    imageData,
    lateralPartSize,
    cornerWidth,
    cornerWidth,
    0,
  );
  const topRight = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
    0,
  );
  const left = imageDataToUrl(
    imageData,
    cornerWidth,
    lateralPartSize,
    0,
    cornerWidth,
  );
  const right = imageDataToUrl(
    imageData,
    cornerWidth,
    lateralPartSize,
    cornerWidth + lateralPartSize,
    cornerWidth,
  );
  const bottomLeft = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    0,
    cornerWidth + lateralPartSize,
  );
  const bottom = imageDataToUrl(
    imageData,
    lateralPartSize,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
  );
  const bottomRight = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
    cornerWidth + lateralPartSize,
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
// Component that renders the 8 parts of an image and composites them together.
// Used internally by the Filter component, for DisplacementMap and SpecularMap.
//

type CompositePartsProps = {
  imageData: MotionValue<ImageData>;
  cornerWidth: MotionValue<number>;
  pixelRatio: number;
  width: MotionValue<number>;
  height: MotionValue<number>;
  result: string;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * Component that renders the 8 parts of an image and composites them together.
 *
 * Used internally by the Filter component, for DisplacementMap and SpecularMap.
 *
 * @private
 */
const CompositeParts: React.FC<CompositePartsProps> = memo(
  ({
    imageData,
    cornerWidth,
    width,
    height,
    pixelRatio,
    result,
    hideTop,
    hideBottom,
    hideLeft,
    hideRight,
  }) => {
    const parts = useTransform(() =>
      splitImageDataToParts({
        imageData: imageData.get(),
        cornerWidth: cornerWidth.get(),
        pixelRatio,
      }),
    );

    return (
      <>
        {/* Image Parts */}
        <motion.feImage
          href={useTransform(parts, (_) => _.topLeft)}
          x={0}
          y={0}
          width={cornerWidth}
          height={cornerWidth}
          result={`${result}_topLeft`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.top)}
          x={0}
          y={0}
          width={width}
          height={cornerWidth}
          result={`${result}_top`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.topRight)}
          x={useTransform(() => width.get() - cornerWidth.get())}
          y={0}
          width={cornerWidth}
          height={cornerWidth}
          result={`${result}_topRight`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.left)}
          x={0}
          y={0}
          width={cornerWidth}
          height={height}
          result={`${result}_left`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.right)}
          x={useTransform(() => width.get() - cornerWidth.get())}
          y={0}
          width={cornerWidth}
          height={height}
          result={`${result}_right`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottomLeft)}
          x={0}
          y={useTransform(() => height.get() - cornerWidth.get())}
          width={cornerWidth}
          height={cornerWidth}
          result={`${result}_bottomLeft`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottom)}
          x={0}
          y={useTransform(() => height.get() - cornerWidth.get())}
          width={width}
          height={cornerWidth}
          result={`${result}_bottom`}
          preserveAspectRatio="none"
        />
        <motion.feImage
          href={useTransform(parts, (_) => _.bottomRight)}
          x={useTransform(() => width.get() - cornerWidth.get())}
          y={useTransform(() => height.get() - cornerWidth.get())}
          width={cornerWidth}
          height={cornerWidth}
          result={`${result}_bottomRight`}
          preserveAspectRatio="none"
        />

        {/* Composite parts together */}

        <motion.feFlood
          floodColor="rgb(128,128,128)"
          floodOpacity="1"
          result={`${result}_base`}
        />

        {[
          !hideTop && "top",
          !hideLeft && "left",
          !hideRight && "right",
          !hideBottom && "bottom",
          !hideTop && !hideLeft && "topLeft",
          !hideTop && !hideRight && "topRight",
          !hideBottom && !hideLeft && "bottomLeft",
          !hideBottom && !hideRight && "bottomRight",
        ]
          .filter((_) => typeof _ === "string")
          .map((partName, index, arr) => (
            <motion.feComposite
              key={partName}
              operator="over"
              in={`${result}_${partName}`}
              in2={
                index === 0 ? `${result}_base` : `${result}_composite_${index}`
              }
              result={
                index === arr.length - 1
                  ? result
                  : `${result}_composite_${index}`
              }
            />
          ))}
      </>
    );
  },
);

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
  specularAngle: MotionValue<number>;
  bezelHeightFn: (x: number) => number;
  pixelRatio: number;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
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
    bezelHeightFn,
    pixelRatio,
    hideTop,
    hideBottom,
    hideLeft,
    hideRight,
  }) => {
    // Size of each corner area
    // If bezelWidth < radius, corners will be in a circle shape
    // If bezelWidth >= radius, corners will be in a rounded square shape
    const cornerWidth = useTransform(() =>
      Math.max(radius.get(), bezelWidth.get()),
    );

    /** Calculated image will always be a square that contains 4 corners + {@link LATERAL_PART_SIZE} pixel for middle * */
    const imageSide = useTransform(
      () => cornerWidth.get() * 2 + LATERAL_PART_SIZE,
    );

    const map = useTransform(() => {
      return calculateDisplacementMapRadius(
        glassThickness.get(),
        bezelWidth.get(),
        bezelHeightFn,
        refractiveIndex.get(),
      );
    });

    const maximumDisplacement = useTransform(() =>
      Math.max(...map.get().map(Math.abs)),
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
      () => maximumDisplacement.get() * scaleRatio.get(),
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
          cornerWidth={cornerWidth}
          pixelRatio={pixelRatio}
          result="displacement_map"
          hideTop={hideTop}
          hideBottom={hideBottom}
          hideLeft={hideLeft}
          hideRight={hideRight}
        />

        <CompositeParts
          imageData={specularMap}
          width={width}
          height={height}
          cornerWidth={cornerWidth}
          pixelRatio={pixelRatio}
          result="specular_map"
          hideTop={hideTop}
          hideBottom={hideBottom}
          hideLeft={hideLeft}
          hideRight={hideRight}
        />

        <motion.feDisplacementMap
          in="blurred_source"
          in2="displacement_map"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced_source"
        />

        <motion.feColorMatrix
          in="specular_map"
          type="luminanceToAlpha"
          result="specular_alpha"
        />

        <motion.feComponentTransfer
          in="specular_alpha"
          result="specular_with_opacity"
        >
          <motion.feFuncA type="linear" slope={specularOpacity} />
        </motion.feComponentTransfer>

        <motion.feFlood floodColor="white" result="white_layer" />

        <motion.feComposite
          in="white_layer"
          in2="specular_with_opacity"
          operator="in"
          result="masked_specular"
        />

        <motion.feComposite
          in="masked_specular"
          in2="displaced_source"
          operator="over"
        />
      </filter>
    );

    return (
      <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
        <defs>{content}</defs>
      </svg>
    );
  },
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
  specularAngle?: number | MotionValue<number>;
  bezelHeightFn?: (x: number) => number;
  pixelRatio?: number;
  hideTop?: boolean;
  hideBottom?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
};

/**
 * SVG Filter component that creates a refactive filter usable as backdrop-filter CSS property.
 *
 * Usage:
 *
 * ```tsx
 * return <>
 *   <Filter id="glass-filter" />
 *   <div style={{ backdrop-filter: "url(#glass-filter)" }} />
 * </>
 * ```
 */
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
    specularAngle = Math.PI / 4,
    bezelHeightFn = CONVEX,
    pixelRatio,
    hideTop,
    hideBottom,
    hideLeft,
    hideRight,
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
      specularAngle={useToMotion(specularAngle)}
      bezelHeightFn={bezelHeightFn}
      pixelRatio={pixelRatio ?? getDevicePixelRatio()}
      hideBottom={hideBottom}
      hideLeft={hideLeft}
      hideRight={hideRight}
      hideTop={hideTop}
    />
  ),
);
