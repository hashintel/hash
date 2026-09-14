import type { ResizableEdge } from "../../../../../../resize/resize-handle";

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
  edge: ResizableEdge,
  delta: number,
) => {
  const { right, top, width, height, parentWidth, parentHeight } = bounds;
  switch (edge) {
    case "left":
      return {
        right,
        top,
        width: clampSize(
          width - delta,
          320,
          Math.min(720, parentWidth - right - 12),
        ),
        height,
      };
    case "right": {
      const nextWidth = clampSize(
        width + delta,
        320,
        Math.min(720, width + right - 12),
      );
      return {
        right: right + width - nextWidth,
        top,
        width: nextWidth,
        height,
      };
    }
    case "top": {
      const nextHeight = clampSize(height - delta, 320, height + top - 12);
      return {
        right,
        top: top + height - nextHeight,
        width,
        height: nextHeight,
      };
    }
    case "bottom":
      return {
        right,
        top,
        width,
        height: clampSize(height + delta, 320, parentHeight - top - 12),
      };
  }
};
