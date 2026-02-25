import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { FaChevronRight } from "react-icons/fa6";
import { Group, Panel, Separator } from "react-resizable-panels";

import { InfoIconTooltip } from "../../tooltip";
import type { SubView } from "../types";

/** Height of the header row in pixels */
const HEADER_HEIGHT = 44;
/** Default minimum panel height when no per-subview minHeight is set */
const DEFAULT_MIN_PANEL_HEIGHT = 100;

const containerStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  /**
   * Animate programmatic collapse/expand via CSS transition on flex-grow.
   * Disabled when a separator is actively being dragged (data-separator="active")
   * so drag-to-resize stays snappy.
   */
  "& [data-panel]": {
    transition: "[flex-grow 200ms ease-out]",
  },
  "&:has([data-separator=active]) [data-panel]": {
    transition: "[none]",
  },
});

const sectionWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  overflow: "hidden",
});

const sectionContentStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
});

const scrollContainerStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

const panelContentStyle = css({
  overflowY: "auto",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  p: "3",
  pt: "0",
});

const SHADOW_HEIGHT = 7;

const scrollShadowStyle = cva({
  base: {
    position: "absolute",
    left: "[0]",
    right: "[0]",
    height: `[${SHADOW_HEIGHT}px]`,
    pointerEvents: "none",
    zIndex: 1,
    opacity: "[0]",
    transition: "[opacity 150ms ease]",
  },
  variants: {
    position: {
      top: {
        top: "[0]",
        background: "[linear-gradient(to bottom, #F0F0F0, transparent)]",
      },
      bottom: {
        bottom: "[0]",
        background: "[linear-gradient(to top, #F0F0F0, transparent)]",
      },
    },
    visible: {
      true: { opacity: "[0.7]" },
    },
  },
});

const resizeHandleStyle = css({
  borderTopWidth: "thin",
  borderTopColor: "neutral.a30",
  cursor: "ns-resize",
  backgroundColor: "[transparent]",
  transition: "[background-color 0.15s ease]",
  "&[data-separator=hover]": {
    backgroundColor: "[rgba(0, 0, 0, 0.1)]",
  },
  "&[data-separator=active]": {
    backgroundColor: "[rgba(59, 130, 246, 0.4)]",
  },
});

const headerRowStyle = css({
  height: "[44px]",
  px: "2",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

const headerActionStyle = css({
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[44px]",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const sectionToggleStyle = css({
  display: "flex",
  alignItems: "center",
  fontWeight: "medium",
  fontSize: "sm",
  color: "neutral.s100",
  cursor: "pointer",
});

const sectionToggleIconStyle = css({
  w: "4",
  display: "flex",
  justifyContent: "center",
  transition: "[transform 150ms ease-out]",
});

const sectionToggleIconExpandedStyle = css({
  transform: "[rotate(90deg)]",
});

const mainTitleStyle = css({
  fontWeight: "semibold",
  fontSize: "base",
  px: "1",
});

/**
 * Wraps children in a scrollable container with top/bottom gradient shadows
 * that fade in when content overflows in that direction.
 */
const ScrollableContent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    updateShadows();

    const observer = new ResizeObserver(updateShadows);
    observer.observe(el);
    for (const child of el.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [updateShadows]);

  return (
    <div className={scrollContainerStyle}>
      <div
        className={scrollShadowStyle({
          position: "top",
          visible: canScrollUp,
        })}
      />
      <div
        ref={scrollRef}
        className={panelContentStyle}
        onScroll={updateShadows}
      >
        {children}
      </div>
      <div
        className={scrollShadowStyle({
          position: "bottom",
          visible: canScrollDown,
        })}
      />
    </div>
  );
};

interface SubViewHeaderProps {
  id: string;
  title: string;
  tooltip?: string;
  main?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  renderHeaderAction?: () => React.ReactNode;
}

const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  id,
  title,
  tooltip,
  main = false,
  isExpanded,
  onToggle,
  renderHeaderAction,
}) => (
  <div className={headerRowStyle}>
    {main ? (
      <div className={mainTitleStyle}>{title}</div>
    ) : (
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className={sectionToggleStyle}
        aria-expanded={isExpanded}
        aria-controls={`subview-content-${id}`}
      >
        <div
          className={cx(
            sectionToggleIconStyle,
            isExpanded && sectionToggleIconExpandedStyle,
          )}
        >
          <FaChevronRight size={9} />
        </div>
        <span>
          {title}
          {tooltip && <InfoIconTooltip tooltip={tooltip} />}
        </span>
      </div>
    )}
    {isExpanded && renderHeaderAction && (
      <div className={headerActionStyle}>{renderHeaderAction()}</div>
    )}
  </div>
);

interface VerticalSubViewsContainerProps {
  /** Array of subviews to display */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Vertical container that fills available space.
 * Uses react-resizable-panels for drag-to-resize between sections.
 * Each section can be collapsed by clicking its header.
 */
export const VerticalSubViewsContainer: React.FC<
  VerticalSubViewsContainerProps
> = ({ subViews, defaultExpanded = true }) => {
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(subViews.map((sv) => [sv.id, !defaultExpanded])),
  );

  const toggleSection = useCallback((id: string) => {
    setCollapsedState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const allCollapsed = subViews.every((sv) => {
    const isCollapsible = !sv.main && (sv.collapsible ?? true);
    return isCollapsible && collapsedState[sv.id];
  });

  return (
    <Group orientation="vertical" className={containerStyle}>
      {subViews.map((subView, index) => {
        const isMain = subView.main ?? false;
        const isCollapsible = !isMain && (subView.collapsible ?? true);
        const isExpanded = !isCollapsible || !collapsedState[subView.id];
        const Component = subView.component;
        const minSize = subView.minHeight ?? DEFAULT_MIN_PANEL_HEIGHT;

        return (
          <Fragment key={subView.id}>
            <Panel
              id={subView.id}
              minSize={isExpanded ? minSize : HEADER_HEIGHT}
              maxSize={isExpanded ? undefined : HEADER_HEIGHT}
            >
              <div className={sectionWrapperStyle}>
                <SubViewHeader
                  id={subView.id}
                  title={subView.title}
                  tooltip={subView.tooltip}
                  main={isMain}
                  isExpanded={isExpanded}
                  onToggle={() => toggleSection(subView.id)}
                  renderHeaderAction={subView.renderHeaderAction}
                />

                {isExpanded && (
                  <div className={sectionContentStyle}>
                    <ScrollableContent>
                      <Component />
                    </ScrollableContent>
                  </div>
                )}
              </div>
            </Panel>

            {index < subViews.length - 1 && (
              <Separator className={resizeHandleStyle} />
            )}
          </Fragment>
        );
      })}

      {/* Spacer absorbs remaining space when panels are collapsed */}
      <Panel minSize={0} maxSize={allCollapsed ? "100%" : 0} />
    </Group>
  );
};
