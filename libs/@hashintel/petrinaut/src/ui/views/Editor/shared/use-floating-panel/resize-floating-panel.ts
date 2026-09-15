import type { ResizableEdge } from "../../../../resize/resize-handle";

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

export const defaultFloatingPanelLimits = {
  minWidth: 320,
  minHeight: 320,
  maxWidth: 720,
  gap: 12,
};

export type FloatingPanelLimits = typeof defaultFloatingPanelLimits;

const clampSize = (size: number, minimum: number, maximum: number) =>
  Math.min(Math.max(0, maximum), Math.max(minimum, size));

export const resizeFloatingPanel = (
  bounds: FloatingPanelBounds,
  direction: FloatingResizeDirection,
  delta: { x: number; y: number },
  limits: FloatingPanelLimits = defaultFloatingPanelLimits,
) => {
  const { right, top, width, height, parentWidth, parentHeight } = bounds;
  const { minWidth, minHeight, maxWidth, gap } = limits;
  let nextWidth = width;
  let nextHeight = height;
  if (direction.includes("left")) {
    nextWidth = clampSize(
      width - delta.x,
      minWidth,
      Math.min(maxWidth, parentWidth - right - gap),
    );
  } else if (direction.includes("right")) {
    nextWidth = clampSize(
      width + delta.x,
      minWidth,
      Math.min(maxWidth, width + right - gap),
    );
  }
  if (direction.includes("top")) {
    nextHeight = clampSize(height - delta.y, minHeight, height + top - gap);
  } else if (direction.includes("bottom")) {
    nextHeight = clampSize(
      height + delta.y,
      minHeight,
      parentHeight - top - gap,
    );
  }
  return {
    right: direction.includes("right") ? right + width - nextWidth : right,
    top: direction.includes("top") ? top + height - nextHeight : top,
    width: nextWidth,
    height: nextHeight,
  };
};
