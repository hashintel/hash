import type { Parts } from "../../helpers/split-imagedata-to-parts";

type CompositePartsProps = {
  parts: Parts;
  cornerWidth: number;
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
 * Renders pre-split 9-patch parts as feImage primitives and composites them together.
 *
 * Unlike the "image" compositing strategy (which builds a single SVG data URL),
 * this uses explicit pixel positions and requires width/height from a ResizeObserver.
 */
export const CompositeParts: React.FC<CompositePartsProps> = ({
  parts,
  cornerWidth,
  width,
  height,
  result,
  hideTop,
  hideBottom,
  hideLeft,
  hideRight,
}) => {
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
