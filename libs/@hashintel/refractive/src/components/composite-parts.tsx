import type { ImageData } from "canvas";
import { splitImageDataToParts } from "../helpers/split-imagedata-to-parts";

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
 * @private
 * Component that renders the 8 parts of an image and composites them together.
 *
 * Used internally by the Filter component, for DisplacementMap and SpecularMap.
 *
 * @return {JSX.Element} Fragment containing all image parts for the refractive effect, along with compositing.
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
