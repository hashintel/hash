import { css, cva } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../tooltip";
import type { SubView, SubViewResizeConfig } from "./types";

const sectionContainerStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[4px]",
  },
  variants: {
    hasBottomPadding: {
      true: {
        paddingBottom: "[8px]",
      },
      false: {
        paddingBottom: "[0]",
      },
    },
    flexGrow: {
      true: {
        flex: "[1]",
        minHeight: "[0]",
      },
    },
  },
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

const sectionToggleButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontWeight: 600,
  fontSize: "[13px]",
  color: "[#333]",
  cursor: "pointer",
  background: "[transparent]",
  border: "none",
  padding: "spacing.1",
  borderRadius: "radius.4",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const contentContainerStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[2px]",
    overflowY: "auto",
  },
  variants: {
    flexGrow: {
      true: {
        flex: "[1]",
      },
      false: {
        maxHeight: "[200px]",
      },
    },
  },
});

const resizableContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  overflowY: "auto",
});

const resizeHandleStyle = cva({
  base: {
    height: "[6px]",
    cursor: "ns-resize",
    backgroundColor: "[transparent]",
    border: "none",
    padding: "[0]",
    borderRadius: "[3px]",
    transition: "[background-color 0.15s ease]",
    _hover: {
      backgroundColor: "[rgba(0, 0, 0, 0.08)]",
    },
  },
  variants: {
    isResizing: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.3)]",
      },
    },
    position: {
      top: {
        marginBottom: "[2px]",
      },
      bottom: {
        marginTop: "[2px]",
      },
    },
  },
});

/**
 * Custom hook for resize logic that can be used at any component level.
 */
const useResizable = (
  config: SubViewResizeConfig,
  handlePosition: "top" | "bottom"
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
    [height]
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
    [isResizing, config.minHeight, config.maxHeight, handlePosition]
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

interface ResizeHandleProps {
  position: "top" | "bottom";
  isResizing: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
}

/**
 * Reusable resize handle button component.
 */
const ResizeHandle: React.FC<ResizeHandleProps> = ({
  position,
  isResizing,
  onMouseDown,
}) => (
  <button
    type="button"
    aria-label="Resize section"
    onMouseDown={onMouseDown}
    className={resizeHandleStyle({ isResizing, position })}
  />
);

/** Default resize config used when resizable is undefined but we need the hook */
const DEFAULT_RESIZE_CONFIG: SubViewResizeConfig = {
  defaultHeight: 150,
  minHeight: 80,
  maxHeight: 400,
};

interface VerticalSubViewSectionProps {
  subView: SubView;
  defaultExpanded?: boolean;
  isLast?: boolean;
  /** Position of resize handles for resizable sections. Defaults to 'bottom'. */
  resizeHandlePosition?: "top" | "bottom";
}

/**
 * A single collapsible section within the vertical container.
 */
const VerticalSubViewSection: React.FC<VerticalSubViewSectionProps> = ({
  subView,
  defaultExpanded = true,
  isLast = false,
  resizeHandlePosition = "bottom",
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const {
    id,
    title,
    tooltip,
    component: Component,
    renderHeaderAction,
    flexGrow = false,
    resizable,
  } = subView;

  // Use the resize hook - it will be used only if resizable is defined
  const { height, isResizing, handleResizeStart } = useResizable(
    resizable ?? DEFAULT_RESIZE_CONFIG,
    resizeHandlePosition
  );

  // Last item should grow if it has flexGrow, but shouldn't have bottom border
  const effectiveFlexGrow = isLast ? flexGrow : false;

  // Resizable sections use the resize handle as separator, so no bottom padding needed
  // Non-resizable sections (except last) need bottom padding for separation
  const hasBottomPadding = !resizable && !isLast;

  const renderContent = () => {
    if (resizable) {
      // Resizable content with controlled height
      return (
        <>
          <div
            id={`subview-content-${id}`}
            className={resizableContentStyle}
            style={{ height: `${height}px` }}
          >
            <Component />
          </div>
          {/* Bottom handle rendered after content */}
          {resizeHandlePosition === "bottom" && (
            <ResizeHandle
              position="bottom"
              isResizing={isResizing}
              onMouseDown={handleResizeStart}
            />
          )}
        </>
      );
    }

    return (
      <div
        id={`subview-content-${id}`}
        className={contentContainerStyle({ flexGrow: effectiveFlexGrow })}
      >
        <Component />
      </div>
    );
  };

  return (
    <div
      className={sectionContainerStyle({
        flexGrow: effectiveFlexGrow,
        hasBottomPadding,
      })}
    >
      {/* Top handle rendered before header when position is "top" */}
      {resizable && resizeHandlePosition === "top" && isExpanded && (
        <ResizeHandle
          position="top"
          isResizing={isResizing}
          onMouseDown={handleResizeStart}
        />
      )}

      <div className={headerRowStyle}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={sectionToggleButtonStyle}
          aria-expanded={isExpanded}
          aria-controls={`subview-content-${id}`}
        >
          {isExpanded ? (
            <FaChevronDown size={10} />
          ) : (
            <FaChevronRight size={10} />
          )}
          <span>
            {title}
            {tooltip && <InfoIconTooltip tooltip={tooltip} />}
          </span>
        </button>
        {renderHeaderAction?.()}
      </div>

      {isExpanded && renderContent()}
    </div>
  );
};

interface VerticalSubViewsContainerProps {
  /** Array of subviews to display as collapsible sections */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
  /**
   * Position of resize handles for resizable sections.
   * Use 'top' when the container is aligned to the bottom of its parent.
   * Defaults to 'bottom'.
   */
  resizeHandlePosition?: "top" | "bottom";
}

/**
 * Container that displays subviews as vertically stacked collapsible sections.
 * Used in the LeftSideBar for Token Types, Differential Equations, and Nodes.
 */
export const VerticalSubViewsContainer: React.FC<
  VerticalSubViewsContainerProps
> = ({ subViews, defaultExpanded = true, resizeHandlePosition = "bottom" }) => {
  return (
    <>
      {subViews.map((subView, index) => (
        <VerticalSubViewSection
          key={subView.id}
          subView={subView}
          defaultExpanded={defaultExpanded}
          isLast={index === subViews.length - 1}
          resizeHandlePosition={resizeHandlePosition}
        />
      ))}
    </>
  );
};
