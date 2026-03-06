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
  const overlayRef = useRef<HTMLDivElement | null>(null);

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

    const overlay = createOverlay(direction);
    overlayRef.current = overlay;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      overlay.remove();
      overlayRef.current = null;
    };
  }, [isResizing, direction, handleMouseMove, handleMouseUp]);

  return { isResizing, handleMouseDown };
};
