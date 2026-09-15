import type { ResizableEdge } from "../../../../../../resize/resize-handle";

export type FloatingResizeDirection =
  | ResizableEdge
  | `${"top" | "bottom"}-${"left" | "right"}`;

export type FloatingPanelBounds = {
  right: number;
  top: number;
  width: number;
  height: number;
  parentWidth: number;
  parentHeight: number;
};

const clampSize = (size: number, minimum: number, maximum: number) =>
  Math.min(Math.max(0, maximum), Math.max(minimum, size));

export const resizeFloatingPanel = (
  bounds: FloatingPanelBounds,
  direction: FloatingResizeDirection,
  delta: { x: number; y: number },
) => {
  const { right, top, width, height, parentWidth, parentHeight } = bounds;
  let nextWidth = width;
  let nextHeight = height;
  if (direction.includes("left")) {
    nextWidth = clampSize(
      width - delta.x,
      320,
      Math.min(720, parentWidth - right - 12),
    );
  } else if (direction.includes("right")) {
    nextWidth = clampSize(
      width + delta.x,
      320,
      Math.min(720, width + right - 12),
    );
  }
  if (direction.includes("top")) {
    nextHeight = clampSize(height - delta.y, 320, height + top - 12);
  } else if (direction.includes("bottom")) {
    nextHeight = clampSize(height + delta.y, 320, parentHeight - top - 12);
  }
  return {
    right: direction.includes("right") ? right + width - nextWidth : right,
    top: direction.includes("top") ? top + height - nextHeight : top,
    width: nextWidth,
    height: nextHeight,
  };
};
