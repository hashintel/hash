import { useCallback, useRef, useState } from "react";

import {
  type ResizeDirection,
  useResizeDrag,
} from "../../../resize/use-resize-drag";

export type ResizeEdge = "top" | "bottom" | "left" | "right";

interface UseResizableOptions {
  /** Initial size in pixels. */
  defaultSize: number;
  /** Minimum size constraint (default 0). */
  minSize?: number;
  /** Maximum size constraint (default Infinity). */
  maxSize?: number;
  /** Which edge the resize handle sits on. Determines direction and delta sign. */
  edge: ResizeEdge;
}

const edgeToDirection = (edge: ResizeEdge): ResizeDirection =>
  edge === "top" || edge === "bottom" ? "vertical" : "horizontal";

/** Edges where dragging toward the origin increases size. */
const isReversed = (edge: ResizeEdge) => edge === "top" || edge === "left";

/**
 * Hook that manages a resizable size (width or height) via mouse drag.
 *
 * Built on {@link useResizeDrag}. The returned `size` is clamped between
 * `minSize` and `maxSize` and automatically adjusts based on drag delta.
 */
export const useResizable = ({
  defaultSize,
  minSize = 0,
  maxSize = Number.POSITIVE_INFINITY,
  edge,
}: UseResizableOptions) => {
  const [size, setSize] = useState(defaultSize);
  const sizeAtStartRef = useRef(defaultSize);

  const reverse = isReversed(edge);

  const onDrag = useCallback(
    (delta: number) => {
      const effectiveDelta = reverse ? -delta : delta;
      const newSize = sizeAtStartRef.current + effectiveDelta;
      setSize(Math.max(minSize, Math.min(maxSize, newSize)));
    },
    [reverse, minSize, maxSize],
  );

  const { isResizing, handleMouseDown } = useResizeDrag({
    onDrag,
    direction: edgeToDirection(edge),
  });

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      sizeAtStartRef.current = size;
      handleMouseDown(event);
    },
    [size, handleMouseDown],
  );

  return { size, isResizing, handleResizeStart };
};
