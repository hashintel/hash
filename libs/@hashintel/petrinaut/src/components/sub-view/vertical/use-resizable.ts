import { useCallback, useEffect, useRef, useState } from "react";

import type { SubViewResizeConfig } from "../types";

/**
 * Custom hook for resize logic that can be used at any component level.
 */
export const useResizable = (
  config: SubViewResizeConfig,
  handlePosition: "top" | "bottom",
) => {
  const [height, setHeight] = useState(config.defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsResizing(true);
      resizeStartY.current = event.clientY;
      resizeStartHeight.current = height;
    },
    [height],
  );

  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) {
        return;
      }

      const delta = event.clientY - resizeStartY.current;
      // When handle is at top, invert the delta: dragging up should increase height
      const effectiveDelta = handlePosition === "top" ? -delta : delta;
      const newHeight = resizeStartHeight.current + effectiveDelta;

      const minHeight = config.minHeight ?? 100;
      const maxHeight = config.maxHeight ?? 600;

      setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    },
    [isResizing, config.minHeight, config.maxHeight, handlePosition],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Global event listeners during resize
  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return { height, isResizing, handleResizeStart };
};

/** Default resize config used when resizable is undefined but we need the hook */
export const DEFAULT_RESIZE_CONFIG: SubViewResizeConfig = {
  defaultHeight: 150,
  minHeight: 80,
  maxHeight: 400,
};
