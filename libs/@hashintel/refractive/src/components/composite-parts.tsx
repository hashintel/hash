import type { ImageData } from "canvas";

import { imageDataToUrl } from "../helpers/image-data-to-url";

// Each part is a Base64-encoded PNG image
type Parts = {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  center: string;
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
  // This is to always keep width and height odd, so we can always extract a center part to stretch
  const lateralPartSize = 1 * props.pixelRatio;

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
  const center = imageDataToUrl(
    imageData,
    lateralPartSize,
    lateralPartSize,
    cornerWidth,
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
    center,
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
  imageData: ImageData;
  cornerWidth: number;
  pixelRatio: number;
  width: number;
  height: number;
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
export const CompositeParts: React.FC<CompositePartsProps> = ({
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
  const parts = splitImageDataToParts({
    imageData: imageData,
    cornerWidth: cornerWidth,
    pixelRatio,
  });

  const widthMinusCorner = width - cornerWidth;
  const heightMinusCorner = height - cornerWidth;

  return (
    <>
      {/* Image Parts */}
      <feImage
        href={parts.topLeft}
        x={0}
        y={0}
        width={cornerWidth}
        height={cornerWidth}
        result={`${result}_topLeft`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.top}
        x={0}
        y={0}
        width={width}
        height={cornerWidth}
        result={`${result}_top`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.topRight}
        x={widthMinusCorner}
        y={0}
        width={cornerWidth}
        height={cornerWidth}
        result={`${result}_topRight`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.left}
        x={0}
        y={0}
        width={cornerWidth}
        height={height}
        result={`${result}_left`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.right}
        y={0}
        x={widthMinusCorner}
        width={cornerWidth}
        height={height}
        result={`${result}_right`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.bottomLeft}
        x={0}
        y={heightMinusCorner}
        width={cornerWidth}
        height={cornerWidth}
        result={`${result}_bottomLeft`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.bottom}
        x={0}
        y={heightMinusCorner}
        width={width}
        height={cornerWidth}
        result={`${result}_bottom`}
        preserveAspectRatio="none"
      />
      <feImage
        href={parts.bottomRight}
        x={widthMinusCorner}
        y={heightMinusCorner}
        width={cornerWidth}
        height={cornerWidth}
        result={`${result}_bottomRight`}
        preserveAspectRatio="none"
      />

      {/* Composite parts together */}

      {/* Center is used as base and is stretched all over the filter */}
      <feImage
        href={parts.center}
        x={0}
        y={0}
        width={width}
        height={height}
        result={`${result}_base`}
        preserveAspectRatio="none"
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
          <feComposite
            key={partName}
            operator="over"
            in={`${result}_${partName}`}
            in2={
              index === 0 ? `${result}_base` : `${result}_composite_${index}`
            }
            result={
              index === arr.length - 1 ? result : `${result}_composite_${index}`
            }
          />
        ))}
    </>
  );
};
