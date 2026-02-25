import { css } from "@hashintel/ds-helpers/css";
import { Fragment, useCallback, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import { Group, Panel, Separator } from "react-resizable-panels";

import { InfoIconTooltip } from "../../tooltip";
import type { SubView } from "../types";

/** Height of the header row in pixels */
const HEADER_HEIGHT = 28;
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

const panelContentStyle = css({
  overflowY: "auto",
  flex: "[1]",
  p: "2",
});

const resizeHandleStyle = css({
  height: "[4px]",
  cursor: "ns-resize",
  backgroundColor: "[transparent]",
  transition: "[background-color 0.15s ease]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.1)]",
  },
  _active: {
    backgroundColor: "[rgba(59, 130, 246, 0.4)]",
  },
});

const headerRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
});

const headerActionStyle = css({
  /** Constrain height so buttons don't grow the header */
  maxHeight: "[20px]",
  overflow: "hidden",
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
});

interface SubViewHeaderProps {
  id: string;
  title: string;
  tooltip?: string;
  isExpanded: boolean;
  onToggle: () => void;
  renderHeaderAction?: () => React.ReactNode;
}

const SubViewHeader: React.FC<SubViewHeaderProps> = ({
  id,
  title,
  tooltip,
  isExpanded,
  onToggle,
  renderHeaderAction,
}) => (
  <div className={headerRowStyle}>
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
      <div className={`${sectionToggleIconStyle} toggle-icon`}>
        {isExpanded ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
      </div>
      <span>
        {title}
        {tooltip && <InfoIconTooltip tooltip={tooltip} />}
      </span>
    </div>
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
    const isCollapsible = !(sv.hideHeader ?? false) && (sv.collapsible ?? true);
    return isCollapsible && collapsedState[sv.id];
  });

  return (
    <Group orientation="vertical" className={containerStyle}>
      {subViews.map((subView, index) => {
        const hideHeader = subView.hideHeader ?? false;
        const isCollapsible = !hideHeader && (subView.collapsible ?? true);
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
                {!hideHeader && (
                  <SubViewHeader
                    id={subView.id}
                    title={subView.title}
                    tooltip={subView.tooltip}
                    isExpanded={isExpanded}
                    onToggle={() => toggleSection(subView.id)}
                    renderHeaderAction={subView.renderHeaderAction}
                  />
                )}

                {isExpanded && (
                  <div className={sectionContentStyle}>
                    <div className={panelContentStyle}>
                      <Component />
                    </div>
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
