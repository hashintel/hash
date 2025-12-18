import { css, cx } from "@hashintel/ds-helpers/css";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { RESIZE_HANDLE_OFFSET, RESIZE_HANDLE_SIZE } from "../constants/ui";

const panelContainerStyle = css({
  position: "relative",
  borderRadius: "[7px]",
  backgroundColor: "[rgba(255, 255, 255, 0.7)]",
  boxShadow: "[0 2px 11px rgba(0, 0, 0, 0.1)]",
  border: "[1px solid rgba(255, 255, 255, 0.8)]",
});

const blurOverlayStyle = css({
  position: "absolute",
  inset: "[0]",
  borderRadius: "[7px]",
  pointerEvents: "none",
  backdropFilter: "[blur(27px)]",
});

const contentContainerStyle = css({
  position: "relative",
  height: "[100%]",
  width: "[100%]",
});

type ResizableEdge = "top" | "bottom" | "left" | "right";

interface ResizeConfig {
  /** Which edge of the panel is resizable */
  edge: ResizableEdge;
  /** Callback when the size changes */
  onResize: (newSize: number) => void;
  /** Current size (width for left/right, height for top/bottom) */
  size: number;
  /** Minimum size constraint */
  minSize?: number;
  /** Maximum size constraint */
  maxSize?: number;
}

interface GlassPanelProps {
  /** Content to render inside the panel */
  children: ReactNode;
  /** Additional CSS class name for the panel container */
  className?: string;
  /** Inline styles for the panel container */
  style?: CSSProperties;
  /** Additional CSS class name for the content container */
  contentClassName?: string;
  /** Inline styles for the content container */
  contentStyle?: CSSProperties;
  /** Blur amount in pixels (default: 24) */
  blur?: number;
  /** Configuration for making the panel resizable */
  resizable?: ResizeConfig;
}

const getResizeHandleStyle = (edge: ResizableEdge): CSSProperties => {
  const base: CSSProperties = {
    position: "absolute",
    background: "transparent",
    border: "none",
    padding: 0,
    zIndex: 1001,
  };

  switch (edge) {
    case "top":
      return {
        ...base,
        top: RESIZE_HANDLE_OFFSET,
        left: 0,
        right: 0,
        height: RESIZE_HANDLE_SIZE,
        cursor: "ns-resize",
      };
    case "bottom":
      return {
        ...base,
        bottom: RESIZE_HANDLE_OFFSET,
        left: 0,
        right: 0,
        height: RESIZE_HANDLE_SIZE,
        cursor: "ns-resize",
      };
    case "left":
      return {
        ...base,
        top: 0,
        left: RESIZE_HANDLE_OFFSET,
        bottom: 0,
        width: RESIZE_HANDLE_SIZE,
        cursor: "ew-resize",
      };
    case "right":
      return {
        ...base,
        top: 0,
        right: RESIZE_HANDLE_OFFSET,
        bottom: 0,
        width: RESIZE_HANDLE_SIZE,
        cursor: "ew-resize",
      };
  }
};

const getCursorStyle = (edge: ResizableEdge): string => {
  return edge === "top" || edge === "bottom" ? "ns-resize" : "ew-resize";
};

/**
 * GlassPanel provides a frosted glass-like appearance with backdrop blur.
 *
 * Uses a separate overlay element for the backdrop-filter to avoid
 * interfering with child components that use fixed/absolute positioning
 * (e.g., Monaco Editor hover widgets).
 *
 * Optionally supports resizing from any edge with the `resizable` prop.
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  style,
  contentClassName,
  contentStyle,
  blur = 24,
  resizable,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartPosRef = useRef(0);
  const resizeStartSizeRef = useRef(0);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      if (!resizable) {
        return;
      }

      event.preventDefault();
      setIsResizing(true);

      const isVertical =
        resizable.edge === "top" || resizable.edge === "bottom";
      resizeStartPosRef.current = isVertical ? event.clientY : event.clientX;
      resizeStartSizeRef.current = resizable.size;
    },
    [resizable]
  );

  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      if (!isResizing || !resizable) {
        return;
      }

      const { edge, onResize, minSize = 100, maxSize = 800 } = resizable;
      const isVertical = edge === "top" || edge === "bottom";
      const currentPos = isVertical ? event.clientY : event.clientX;

      // Calculate delta based on edge direction
      // For top/left: dragging towards origin increases size
      // For bottom/right: dragging away from origin increases size
      let delta: number;
      if (edge === "top" || edge === "left") {
        delta = resizeStartPosRef.current - currentPos;
      } else {
        delta = currentPos - resizeStartPosRef.current;
      }

      const newSize = Math.max(
        minSize,
        Math.min(maxSize, resizeStartSizeRef.current + delta)
      );

      onResize(newSize);
    },
    [isResizing, resizable]
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Handle keyboard resize
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!resizable) {
        return;
      }

      const { edge, onResize, size, minSize = 100, maxSize = 800 } = resizable;
      const step = 10;
      let delta = 0;

      if (edge === "top" || edge === "bottom") {
        if (event.key === "ArrowUp") {
          delta = edge === "top" ? step : -step;
        } else if (event.key === "ArrowDown") {
          delta = edge === "top" ? -step : step;
        }
      } else if (event.key === "ArrowLeft") {
        delta = edge === "left" ? step : -step;
      } else if (event.key === "ArrowRight") {
        delta = edge === "left" ? -step : step;
      }

      if (delta !== 0) {
        const newSize = Math.max(minSize, Math.min(maxSize, size + delta));
        onResize(newSize);
      }
    },
    [resizable]
  );

  // Global cursor and event listeners during resize
  useEffect(() => {
    if (!isResizing || !resizable) {
      return;
    }

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = getCursorStyle(resizable.edge);
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resizable, handleResizeMove, handleResizeEnd]);

  return (
    <div className={cx(panelContainerStyle, className)} style={style}>
      {/* Resize handle */}
      {resizable && (
        <button
          type="button"
          aria-label={`Resize panel from ${resizable.edge}`}
          onMouseDown={handleResizeStart}
          onKeyDown={handleKeyDown}
          style={getResizeHandleStyle(resizable.edge)}
        />
      )}

      {/* Blur overlay - separate from content to avoid affecting child positioning */}
      <div
        className={blurOverlayStyle}
        style={blur !== 24 ? { backdropFilter: `blur(${blur}px)` } : undefined}
      />

      {/* Content container */}
      <div
        className={cx(contentContainerStyle, contentClassName)}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
};
