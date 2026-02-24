import { css, cx } from "@hashintel/ds-helpers/css";
import { type CSSProperties, type ReactNode, useCallback, useRef } from "react";

import { RESIZE_HANDLE_OFFSET, RESIZE_HANDLE_SIZE } from "../constants/ui";
import { useResizeDrag } from "../resize/use-resize-drag";

const panelContainerStyle = css({
  position: "relative",
  backgroundColor: "neutral.s10",
  borderColor: "neutral.s40",
  boxSizing: "content-box",
  borderStyle: "solid",
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

/**
 * GlassPanel provides a styled container panel.
 *
 * Optionally supports resizing from any edge with the `resizable` prop.
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  style,
  contentClassName,
  contentStyle,
  resizable,
}) => {
  const resizeStartSizeRef = useRef(0);

  const onDrag = useCallback(
    (delta: number) => {
      if (!resizable) {
        return;
      }
      const { edge, onResize, minSize = 100, maxSize = 800 } = resizable;
      const effectiveDelta = edge === "top" || edge === "left" ? -delta : delta;
      const newSize = Math.max(
        minSize,
        Math.min(maxSize, resizeStartSizeRef.current + effectiveDelta),
      );
      onResize(newSize);
    },
    [resizable],
  );

  const direction =
    resizable?.edge === "left" || resizable?.edge === "right"
      ? ("horizontal" as const)
      : ("vertical" as const);

  const { isResizing, handleMouseDown } = useResizeDrag({
    onDrag,
    direction,
  });

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      if (!resizable) {
        return;
      }
      resizeStartSizeRef.current = resizable.size;
      handleMouseDown(event);
    },
    [resizable, handleMouseDown],
  );

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
    [resizable],
  );

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
