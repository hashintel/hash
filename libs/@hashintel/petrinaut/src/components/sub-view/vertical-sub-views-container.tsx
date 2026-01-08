import { css, cva } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

import { InfoIconTooltip } from "../tooltip";
import type { SubView, SubViewResizeConfig } from "./types";

// ============================================================================
// Shared Styles
// ============================================================================

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
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

const resizeHandleStyle = cva({
  base: {
    height: "[6px]",
    cursor: "ns-resize",
    backgroundColor: "[transparent]",
    border: "none",
    padding: "[0]",
    borderRadius: "[3px]",
    transition: "[background-color 0.15s ease]",
    flexShrink: 0,
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

// ============================================================================
// Shared Components
// ============================================================================

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

interface SubViewHeaderProps {
  id: string;
  title: string;
  tooltip?: string;
  isExpanded: boolean;
  onToggle: () => void;
  renderHeaderAction?: () => React.ReactNode;
}

/**
 * Shared header component for subview sections.
 */
const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  id,
  title,
  tooltip,
  isExpanded,
  onToggle,
  renderHeaderAction,
}) => (
  <div className={headerRowStyle}>
    <button
      type="button"
      onClick={onToggle}
      className={sectionToggleButtonStyle}
      aria-expanded={isExpanded}
      aria-controls={`subview-content-${id}`}
    >
      {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
      <span>
        {title}
        {tooltip && <InfoIconTooltip tooltip={tooltip} />}
      </span>
    </button>
    {isExpanded && renderHeaderAction?.()}
  </div>
);

// ============================================================================
// Shared Hooks
// ============================================================================

/**
 * Custom hook for resize logic that can be used at any component level.
 */
const useResizable = (
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
const DEFAULT_RESIZE_CONFIG: SubViewResizeConfig = {
  defaultHeight: 150,
  minHeight: 80,
  maxHeight: 400,
};

// ============================================================================
// ProportionalSubViewsContainer (VSCode-style)
// Fills all available space. Dragging a sash between sections redistributes
// space between those two adjacent sections only. Collapsed sections take no space.
// ============================================================================

const proportionalContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

/**
 * Wrapper style that controls flex distribution.
 * This is the direct child of the flex container.
 */
const proportionalSectionWrapperStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    minHeight: "[0]",
    overflow: "hidden",
  },
  variants: {
    isExpanded: {
      true: {
        // Flex value controlled by inline style for proportional sizing
      },
      false: {
        // Collapsed: just fit header, don't grow
        flex: "[0 0 auto]",
      },
    },
  },
});

const proportionalContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  overflowY: "auto",
  flex: "[1]",
  minHeight: "[0]",
});

const sashStyle = cva({
  base: {
    height: "[4px]",
    cursor: "ns-resize",
    backgroundColor: "[transparent]",
    border: "none",
    padding: "[0]",
    flexShrink: 0,
    transition: "[background-color 0.15s ease]",
    _hover: {
      backgroundColor: "[rgba(0, 0, 0, 0.1)]",
    },
  },
  variants: {
    isResizing: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.4)]",
      },
    },
  },
});

/** Minimum height for each section's content area */
const MIN_SECTION_HEIGHT = 60;
/** Height of the header row */
const HEADER_HEIGHT = 28;

interface ProportionalSubViewsContainerProps {
  /** Array of subviews to display */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * VSCode-style container that fills available space.
 * Dragging a sash between two sections redistributes space between those
 * adjacent sections only. Collapsed sections take no space.
 */
export const ProportionalSubViewsContainer: React.FC<
  ProportionalSubViewsContainerProps
> = ({ subViews, defaultExpanded = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Track expanded state for each section
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(subViews.map((sv) => [sv.id, defaultExpanded])),
  );

  // Track flex-basis (height ratio) for each section
  const [flexBases, setFlexBases] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      subViews.map((sv) => [sv.id, sv.resizable?.defaultHeight ?? 100]),
    ),
  );

  // Resize state
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const resizeStartY = useRef(0);
  const resizeStartBases = useRef<{ above: number; below: number }>({
    above: 0,
    below: 0,
  });
  // Store the actual pixel heights at resize start for 1:1 mouse tracking
  const resizeStartHeights = useRef<{ above: number; below: number }>({
    above: 0,
    below: 0,
  });
  // Store section IDs being resized
  const resizingSections = useRef<{ aboveId: string; belowId: string }>({
    aboveId: "",
    belowId: "",
  });

  // Get expanded sections for resize calculations
  const getExpandedSections = useCallback(() => {
    return subViews
      .map((sv, idx) => ({ subView: sv, index: idx }))
      .filter(({ subView }) => expandedState[subView.id]);
  }, [subViews, expandedState]);

  // Handle sash mouse down - start resizing between sections
  const handleSashMouseDown = useCallback(
    (sashIndex: number) => (event: React.MouseEvent) => {
      event.preventDefault();

      const expandedSections = getExpandedSections();
      // Find the two expanded sections this sash is between
      // sashIndex is the index within expanded sections (sash appears after each expanded section except last)
      const aboveSection = expandedSections[sashIndex];
      const belowSection = expandedSections[sashIndex + 1];

      if (!aboveSection || !belowSection) {
        return;
      }

      // Measure actual pixel heights of the sections being resized
      const aboveElement = document.getElementById(
        `subview-section-${aboveSection.subView.id}`,
      );
      const belowElement = document.getElementById(
        `subview-section-${belowSection.subView.id}`,
      );

      const aboveHeight = aboveElement?.getBoundingClientRect().height ?? 200;
      const belowHeight = belowElement?.getBoundingClientRect().height ?? 200;

      setResizingIndex(sashIndex);
      resizeStartY.current = event.clientY;
      resizeStartBases.current = {
        above: flexBases[aboveSection.subView.id] ?? 100,
        below: flexBases[belowSection.subView.id] ?? 100,
      };
      resizeStartHeights.current = {
        above: aboveHeight,
        below: belowHeight,
      };
      resizingSections.current = {
        aboveId: aboveSection.subView.id,
        belowId: belowSection.subView.id,
      };
    },
    [getExpandedSections, flexBases],
  );

  // Handle mouse move during resize
  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      if (resizingIndex === null) {
        return;
      }

      const { aboveId, belowId } = resizingSections.current;
      if (!aboveId || !belowId) {
        return;
      }

      const delta = event.clientY - resizeStartY.current;
      const { above: startAboveHeight, below: startBelowHeight } =
        resizeStartHeights.current;
      const { above: startAboveBasis, below: startBelowBasis } =
        resizeStartBases.current;

      // Calculate the ratio of flex-basis to actual height
      // This tells us how much to change flex-basis per pixel of desired height change
      const totalHeight = startAboveHeight + startBelowHeight;
      const totalBasis = startAboveBasis + startBelowBasis;
      const basisPerPixel = totalBasis / totalHeight;

      // Calculate new pixel heights
      const minHeight = MIN_SECTION_HEIGHT + HEADER_HEIGHT;
      let newAboveHeight = startAboveHeight + delta;
      let newBelowHeight = startBelowHeight - delta;

      // Enforce minimum heights
      if (newAboveHeight < minHeight) {
        newAboveHeight = minHeight;
        newBelowHeight = totalHeight - minHeight;
      }
      if (newBelowHeight < minHeight) {
        newBelowHeight = minHeight;
        newAboveHeight = totalHeight - minHeight;
      }

      // Convert pixel heights to flex-basis values
      const newAboveBasis = newAboveHeight * basisPerPixel;
      const newBelowBasis = newBelowHeight * basisPerPixel;

      setFlexBases((prev) => ({
        ...prev,
        [aboveId]: newAboveBasis,
        [belowId]: newBelowBasis,
      }));
    },
    [resizingIndex],
  );

  // Handle mouse up - end resize
  const handleResizeEnd = useCallback(() => {
    setResizingIndex(null);
  }, []);

  // Global event listeners during resize
  useEffect(() => {
    if (resizingIndex === null) {
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
  }, [resizingIndex, handleResizeMove, handleResizeEnd]);

  // Toggle section expanded state
  const toggleSection = useCallback((id: string) => {
    setExpandedState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Get expanded sections for rendering
  const expandedSections = getExpandedSections();

  return (
    <div ref={containerRef} className={proportionalContainerStyle}>
      {subViews.map((subView) => {
        const isExpanded = expandedState[subView.id] ?? true;
        const flexBasis = flexBases[subView.id] ?? 100;
        const Component = subView.component;

        // Find index within expanded sections (for sash rendering)
        const expandedIndex = expandedSections.findIndex(
          (es) => es.subView.id === subView.id,
        );
        const isLastExpanded = expandedIndex === expandedSections.length - 1;
        const showSash = isExpanded && !isLastExpanded;

        return (
          <div
            key={subView.id}
            id={`subview-section-${subView.id}`}
            className={proportionalSectionWrapperStyle({ isExpanded })}
            style={
              isExpanded
                ? {
                    flex: `${flexBasis} 1 0%`,
                    minHeight: `${MIN_SECTION_HEIGHT + HEADER_HEIGHT}px`,
                  }
                : undefined
            }
          >
            <SubViewHeader
              id={subView.id}
              title={subView.title}
              tooltip={subView.tooltip}
              isExpanded={isExpanded}
              onToggle={() => toggleSection(subView.id)}
              renderHeaderAction={subView.renderHeaderAction}
            />

            {isExpanded && (
              <>
                <div
                  id={`subview-content-${subView.id}`}
                  className={proportionalContentStyle}
                >
                  <Component />
                </div>

                {/* Sash between this section and next expanded section */}
                {showSash && (
                  <button
                    type="button"
                    aria-label="Resize sections"
                    className={sashStyle({
                      isResizing: resizingIndex === expandedIndex,
                    })}
                    onMouseDown={handleSashMouseDown(expandedIndex)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// FixedHeightSubViewsContainer
// Each section has its own fixed/resizable height. Sections scroll independently.
// This is the original behavior for PropertiesPanel.
// ============================================================================

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

  // Use the resize hook - it will be used only if resizable is defined
  const { height, isResizing, handleResizeStart } = useResizable(
    resizable ?? DEFAULT_RESIZE_CONFIG,
    resizeHandlePosition,
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
          position="top"
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

      {isExpanded && renderContent()}
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

// ============================================================================
// Legacy Export (for backwards compatibility during migration)
// ============================================================================

/**
 * @deprecated Use `FixedHeightSubViewsContainer` or `ProportionalSubViewsContainer` instead.
 */
export const VerticalSubViewsContainer = FixedHeightSubViewsContainer;
