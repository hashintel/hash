/**
 * @layerRoot ui.resize
 * @role Drag-resize primitives — the mouse-drag hook and the edge handle built on it
 */
import { useEffect, useRef, useState } from "react";

import { useLatest } from "../../react/hooks/use-latest";

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
 * Creates a full-screen overlay that captures all pointer events and
 * forces the resize cursor. This prevents hover effects on other
 * elements and avoids iframes swallowing mouse events during a drag.
 */
const createOverlay = (direction: ResizeDirection): HTMLDivElement => {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "99999";
  overlay.style.cursor = getCursor(direction);
  overlay.style.userSelect = "none";
  document.body.appendChild(overlay);
  return overlay;
};

/**
 * Low-level hook that manages a mouse-drag resize gesture.
 *
 * While dragging, a full-screen overlay is rendered to capture all
 * pointer events and enforce the resize cursor.
 */
export const useResizeDrag = ({
  onDrag,
  onDragEnd,
  direction,
}: UseResizeDragOptions) => {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const onDragRef = useLatest(onDrag);
  const onDragEndRef = useLatest(onDragEnd);

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
    startPosRef.current =
      direction === "vertical" ? event.clientY : event.clientX;
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const currentPos =
        direction === "vertical" ? event.clientY : event.clientX;
      onDragRef.current(currentPos - startPosRef.current);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      onDragEndRef.current?.();
    };
    const overlay = createOverlay(direction);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      overlay.remove();
    };
  }, [isResizing, direction, onDragRef, onDragEndRef]);

  return { isResizing, handleMouseDown };
};
