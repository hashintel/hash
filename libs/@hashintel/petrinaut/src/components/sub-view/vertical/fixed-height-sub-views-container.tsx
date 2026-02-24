import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";

import { ResizeHandle } from "./resize-handle";
import { useResizable } from "./use-resizable";
import type { SubView, SubViewResizeConfig } from "../types";
import { SubViewHeader } from "./sub-view-header";

/** Default resize config used when resizable is undefined but we need the hook */
const DEFAULT_RESIZE_CONFIG: SubViewResizeConfig = {
  defaultHeight: 150,
  minHeight: 80,
  maxHeight: 400,
};

/**
 * CSS Grid wrapper for animating content expand/collapse in fixed container.
 * Does NOT use flex: 1 so that fixed heights are respected.
 */
const fixedContentAnimationWrapperStyle = cva({
  base: {
    display: "grid",
    minHeight: "[0]",
    transition: "[grid-template-rows 0.2s ease-out]",
  },
  variants: {
    isExpanded: {
      true: {
        gridTemplateRows: "[1fr]",
      },
      false: {
        gridTemplateRows: "[0fr]",
      },
    },
  },
});

/**
 * Inner content container that collapses with overflow hidden.
 * Uses flex layout so children can scroll independently.
 */
const contentInnerStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

const fixedSectionStyle = cva({
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

const fixedContentStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[2px]",
    overflowY: "auto",
    minHeight: "[0]",
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
  minHeight: "[0]",
});

interface FixedSectionProps {
  subView: SubView;
  defaultExpanded?: boolean;
  isLast?: boolean;
  resizeHandlePosition?: "top" | "bottom";
}

/**
 * A single section within the fixed height container.
 * Each section has its own controlled height via resize handle or fixed max-height.
 */
const FixedSection: React.FC<FixedSectionProps> = ({
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

  const config = resizable ?? DEFAULT_RESIZE_CONFIG;
  const {
    size: height,
    isResizing,
    handleResizeStart,
  } = useResizable({
    defaultSize: config.defaultHeight,
    minSize: config.minHeight,
    maxSize: config.maxHeight,
    edge: resizeHandlePosition,
  });

  // Last item should grow if it has flexGrow, but shouldn't have bottom border
  const effectiveFlexGrow = isLast ? flexGrow : false;

  // Resizable sections use the resize handle as separator, so no bottom padding needed
  // Non-resizable sections (except last) need bottom padding for separation
  const hasBottomPadding = !resizable && !isLast;

  const renderContent = () => {
    if (resizable) {
      // Resizable content with controlled height
      return (
        <div
          id={`subview-content-${id}`}
          className={resizableContentStyle}
          style={{ height: `${height}px` }}
        >
          <Component />
        </div>
      );
    }

    return (
      <div
        id={`subview-content-${id}`}
        className={fixedContentStyle({ flexGrow: effectiveFlexGrow })}
      >
        <Component />
      </div>
    );
  };

  return (
    <div
      className={fixedSectionStyle({
        flexGrow: effectiveFlexGrow,
        hasBottomPadding,
      })}
    >
      {/* Top handle rendered before header when position is "top" */}
      {resizable && resizeHandlePosition === "top" && isExpanded && (
        <ResizeHandle
          direction="vertical"
          isResizing={isResizing}
          onMouseDown={handleResizeStart}
        />
      )}

      <SubViewHeader
        id={id}
        title={title}
        tooltip={tooltip}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        renderHeaderAction={renderHeaderAction}
      />

      {/* Animated content wrapper */}
      <div className={fixedContentAnimationWrapperStyle({ isExpanded })}>
        <div className={contentInnerStyle}>{renderContent()}</div>
      </div>

      {/* Bottom handle rendered after content - outside animation wrapper */}
      {resizable && resizeHandlePosition === "bottom" && isExpanded && (
        <ResizeHandle
          direction="vertical"
          isResizing={isResizing}
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
};

interface FixedHeightSubViewsContainerProps {
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
 * Container where each section has its own fixed or resizable height.
 * Sections maintain their individual heights and scroll independently.
 *
 * Use this when sections should have independent height control and
 * the container should not try to fill its parent.
 */
export const FixedHeightSubViewsContainer: React.FC<
  FixedHeightSubViewsContainerProps
> = ({ subViews, defaultExpanded = true, resizeHandlePosition = "bottom" }) => {
  return (
    <>
      {subViews.map((subView, index) => (
        <FixedSection
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
