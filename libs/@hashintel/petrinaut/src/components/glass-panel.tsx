import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { type CSSProperties, type ReactNode, useCallback, useRef } from "react";

import { RESIZE_HANDLE_OFFSET, RESIZE_HANDLE_SIZE } from "../constants/ui";
import { useResizeDrag } from "../resize/use-resize-drag";

const panelContainerStyle = cva({
  base: {
    position: "relative",
    backgroundColor: "neutral.s10",
    borderColor: "neutral.s40",
    boxSizing: "content-box",
    borderStyle: "solid",
  },
  variants: {
    resizingEdge: {
      top: { borderTopColor: "blue.a70" },
      bottom: { borderBottomColor: "blue.a70" },
      left: { borderLeftColor: "blue.a70" },
      right: { borderRightColor: "blue.a70" },
      none: {},
    },
  },
});

const contentContainerStyle = css({
  position: "relative",
  height: "[100%]",
  width: "[100%]",
});

const resizeHandleStyle = cva({
  base: {
    position: "absolute",
    backgroundColor: "[transparent]",
    padding: "[0]",
    zIndex: "[1001]",
    transition: "[background-color 0.3s ease]",
  },
  variants: {
    isResizing: {
      true: {
        backgroundColor: "blue.a40",
      },
      false: {
        _hover: {
          backgroundColor: "neutral.a30",
        },
      },
    },
    direction: {
      vertical: { cursor: "ns-resize" },
      horizontal: { cursor: "ew-resize" },
    },
  },
});

const getResizeHandlePositionStyle = (edge: ResizableEdge): CSSProperties => {
  switch (edge) {
    case "top":
      return {
        top: RESIZE_HANDLE_OFFSET,
        left: 0,
        right: 0,
        height: RESIZE_HANDLE_SIZE,
      };
    case "bottom":
      return {
        bottom: RESIZE_HANDLE_OFFSET,
        left: 0,
        right: 0,
        height: RESIZE_HANDLE_SIZE,
      };
    case "left":
      return {
        top: 0,
        left: RESIZE_HANDLE_OFFSET,
        bottom: 0,
        width: RESIZE_HANDLE_SIZE,
      };
    case "right":
      return {
        top: 0,
        right: RESIZE_HANDLE_OFFSET,
        bottom: 0,
        width: RESIZE_HANDLE_SIZE,
      };
  }
};

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

  return (
    <div
      className={cx(
        panelContainerStyle({
          resizingEdge: isResizing && resizable ? resizable.edge : "none",
        }),
        className,
      )}
      style={style}
    >
      {/* Resize handle */}
      {resizable && (
        <button
          // Hide from tab order to prevent focus/tab traversal issues
          tabIndex={-1}
          type="button"
          aria-label={`Resize panel from ${resizable.edge}`}
          onMouseDown={handleResizeStart}
          className={resizeHandleStyle({ isResizing, direction })}
          style={getResizeHandlePositionStyle(resizable.edge)}
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
