import { Fragment, useCallback, useRef, useState } from "react";
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  Separator,
} from "react-resizable-panels";

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
  const panelRefs = useRef<Map<string, PanelImperativeHandle>>(new Map());

  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(subViews.map((sv) => [sv.id, !defaultExpanded])),
  );

  const toggleSection = useCallback((id: string) => {
    const panel = panelRefs.current.get(id);
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

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
              collapsible={isCollapsible}
              collapsedSize={isCollapsible ? HEADER_HEIGHT : undefined}
              minSize={minSize}
              onResize={
                isCollapsible
                  ? (panelSize) => {
                      const isNowCollapsed =
                        panelSize.inPixels <= HEADER_HEIGHT;
                      setCollapsedState((prev) => {
                        if (prev[subView.id] === isNowCollapsed) {
                          return prev;
                        }
                        return {
                          ...prev,
                          [subView.id]: isNowCollapsed,
                        };
                      });
                    }
                  : undefined
              }
              panelRef={
                isCollapsible
                  ? (handle) => {
                      if (handle) {
                        panelRefs.current.set(subView.id, handle);
                      } else {
                        panelRefs.current.delete(subView.id);
                      }
                    }
                  : undefined
              }
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
    </Group>
  );
};
