import { useRef } from "react";

import { cva } from "@hashintel/ds-helpers/css";

import { RESIZE_HANDLE_OFFSET, RESIZE_HANDLE_SIZE } from "../constants/ui";
import { useResizeDrag } from "./use-resize-drag";

import type { CSSProperties } from "react";

export type ResizableEdge = "top" | "bottom" | "left" | "right";

const handleStyle = cva({
  base: {
    position: "absolute",
    backgroundColor: "[transparent]",
    borderWidth: "[0]",
    padding: "[0]",
    zIndex: "sticky",
    transition: "[background-color 0.3s ease]",
  },
  variants: {
    isResizing: {
      true: {},
      false: {},
    },
    direction: {
      vertical: { cursor: "ns-resize" },
      horizontal: { cursor: "ew-resize" },
    },
    appearance: {
      // The whole strip tints on hover and while resizing.
      hidden: {},
      // A centred pill line appears on hover and stays while resizing.
      line: {
        _before: {
          content: '""',
          position: "absolute",
          borderRadius: "full",
          backgroundColor: "[transparent]",
          transition: "[background-color 120ms ease-out]",
        },
        _hover: { _before: { backgroundColor: "neutral.a40" } },
      },
    },
  },
  compoundVariants: [
    {
      appearance: "hidden",
      isResizing: true,
      css: { backgroundColor: "blue.a40" },
    },
    {
      appearance: "hidden",
      isResizing: false,
      css: { _hover: { backgroundColor: "neutral.a30" } },
    },
    {
      appearance: "line",
      isResizing: true,
      css: { _before: { backgroundColor: "blue.a70" } },
    },
    {
      appearance: "line",
      direction: "horizontal",
      css: {
        _before: {
          top: "[12px]",
          bottom: "[12px]",
          left: "[50%]",
          width: "[2px]",
          transform: "translateX(-50%)",
        },
      },
    },
    {
      appearance: "line",
      direction: "vertical",
      css: {
        _before: {
          left: "[12px]",
          right: "[12px]",
          top: "[50%]",
          height: "[2px]",
          transform: "translateY(-50%)",
        },
      },
    },
  ],
});

const positionStyle = (edge: ResizableEdge): CSSProperties => {
  switch (edge) {
    case "top":
      return {
        left: 0,
        right: 0,
        top: RESIZE_HANDLE_OFFSET,
        height: RESIZE_HANDLE_SIZE,
      };
    case "bottom":
      return {
        left: 0,
        right: 0,
        bottom: RESIZE_HANDLE_OFFSET,
        height: RESIZE_HANDLE_SIZE,
      };
    case "left":
      return {
        top: 0,
        bottom: 0,
        left: RESIZE_HANDLE_OFFSET,
        width: RESIZE_HANDLE_SIZE,
      };
    case "right":
      return {
        top: 0,
        bottom: 0,
        right: RESIZE_HANDLE_OFFSET,
        width: RESIZE_HANDLE_SIZE,
      };
  }
};

export interface ResizeHandleProps {
  /** Which edge of the positioned parent this handle sits on. */
  edge: ResizableEdge;
  /** Current size along the resized axis, in pixels. */
  size: number;
  onResize: (size: number) => void;
  minSize?: number;
  maxSize?: number;
  /** Accessible label; defaults to naming the edge. */
  label?: string;
  /**
   * Visual affordance: "hidden" tints the whole strip on hover, "line"
   * shows a centred pill. Both turn blue while resizing.
   */
  appearance?: "hidden" | "line";
}

/**
 * A drag handle for resizing the nearest positioned ancestor. Dragging past
 * the min/max bounds clamps rather than detaching, and the underlying hook
 * lays a full-screen overlay over the page for the duration of the gesture so
 * hover states and iframes don't swallow the pointer.
 *
 * The parent must be `position: relative`.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  edge,
  size,
  onResize,
  minSize = 100,
  maxSize = 1200,
  label,
  appearance = "hidden",
}) => {
  const startSizeRef = useRef(0);

  const onDrag = (delta: number) => {
    // Dragging the top or left edge grows the box in the opposite direction
    // to the pointer movement.
    const effectiveDelta = edge === "top" || edge === "left" ? -delta : delta;
    onResize(
      Math.max(
        minSize,
        Math.min(maxSize, startSizeRef.current + effectiveDelta),
      ),
    );
  };

  const direction =
    edge === "left" || edge === "right" ? "horizontal" : "vertical";

  const { isResizing, handleMouseDown } = useResizeDrag({ onDrag, direction });

  return (
    <button
      // Kept out of the tab order: the panels either side are the real targets.
      tabIndex={-1}
      type="button"
      aria-label={label ?? `Resize from ${edge}`}
      // Ancestors can style themselves against an active resize (e.g. a
      // panel highlighting the dragged edge) via :has() on these.
      data-resizing={isResizing}
      data-resize-edge={edge}
      onMouseDown={(event) => {
        startSizeRef.current = size;
        handleMouseDown(event);
      }}
      className={handleStyle({ isResizing, direction, appearance })}
      style={positionStyle(edge)}
    />
  );
};
