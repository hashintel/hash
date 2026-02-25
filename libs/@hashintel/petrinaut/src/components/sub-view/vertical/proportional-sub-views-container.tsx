import { Fragment, useCallback, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import type { SubView } from "../types";
import {
  DEFAULT_MIN_PANEL_HEIGHT,
  HEADER_HEIGHT,
  panelContentStyle,
  proportionalContainerStyle,
  resizeHandleStyle,
  sectionContentStyle,
  sectionWrapperStyle,
} from "./proportional-sub-views-container.styles";
import { SubViewHeader } from "./sub-view-header";

interface ProportionalSubViewsContainerProps {
  /** Array of subviews to display */
  subViews: SubView[];
  /** Whether sections should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Proportional container that fills available space.
 * Uses react-resizable-panels for drag-to-resize between sections.
 * Each section can be collapsed by clicking its header.
 */
export const ProportionalSubViewsContainer: React.FC<
  ProportionalSubViewsContainerProps
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
    <Group orientation="vertical" className={proportionalContainerStyle}>
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
      <Panel id="__spacer" minSize={0} maxSize={allCollapsed ? "100%" : 0} />
    </Group>
  );
};
