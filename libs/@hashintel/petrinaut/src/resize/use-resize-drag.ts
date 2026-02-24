import { useCallback, useEffect, useRef, useState } from "react";

export type ResizeDirection = "horizontal" | "vertical";

interface UseResizeDragOptions {
  /** Called on each mousemove with the pixel delta from drag start. */
  onDrag: (delta: number) => void;
  /** Called when the drag ends. */
  onDragEnd?: () => void;
  /** Determines the cursor style during drag. */
  direction: ResizeDirection;
}

const getCursor = (direction: ResizeDirection) =>
  direction === "vertical" ? "ns-resize" : "ew-resize";

/**
 * Low-level hook that manages a mouse-drag resize gesture.
 *
 * Handles global mousemove/mouseup listeners, body cursor override,
 * and user-select suppression during the drag.
 */
export const useResizeDrag = ({
  onDrag,
  onDragEnd,
  direction,
}: UseResizeDragOptions) => {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);

  // Keep callbacks in refs so the mousemove handler always calls the latest version
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsResizing(true);
      startPosRef.current =
        direction === "vertical" ? event.clientY : event.clientX;
    },
    [direction],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const currentPos =
        direction === "vertical" ? event.clientY : event.clientX;
      onDragRef.current(currentPos - startPosRef.current);
    },
    [direction],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    onDragEndRef.current?.();
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = getCursor(direction);
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, direction, handleMouseMove, handleMouseUp]);

  return { isResizing, handleMouseDown };
};
