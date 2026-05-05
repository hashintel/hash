import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { use, useMemo } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import {
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import {
  LEFT_SIDEBAR_SUBVIEWS,
  LEFT_SIDEBAR_TREE_SUBVIEWS,
} from "../../../../constants/ui-subviews";
import { EditorContext } from "../../../../state/editor-context";
import { UserSettingsContext } from "../../../../state/user-settings-context";
import { searchSubView } from "./subviews/search-panel";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: 1002,
  top: "0",
  left: "0",
  bottom: "0",
  borderRightWidth: "thin",
  boxSizing: "border-box",
});

const panelStyle = cva({
  base: {},
  variants: {
    open: {
      true: {},
      false: {
        transform: "translateX(-100%)",
        pointerEvents: "none",
      },
    },
    animating: {
      true: {
        transition:
          "[width 150ms ease-in-out, opacity 150ms ease-in-out, height 150ms ease-in-out, top 150ms ease-in-out, left 150ms ease-in-out, right 150ms ease-in-out, bottom 150ms ease-in-out, transform 150ms ease-in-out]",
      },
    },
  },
});

const contentWrapperStyle = css({
  position: "relative",
  height: "full",
  overflow: "hidden",
});

const contentLayerStyle = cva({
  base: {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    transition: "[opacity 120ms ease-in-out, transform 120ms ease-in-out]",
  },
  variants: {
    active: {
      true: {
        opacity: "1",
        transform: "none",
        pointerEvents: "auto",
      },
      false: {
        opacity: "0",
        pointerEvents: "none",
        visibility: "hidden",
      },
    },
    direction: {
      forward: {},
      backward: {},
    },
  },
  compoundVariants: [
    {
      active: false,
      direction: "forward",
      css: { transform: "translateX(-8px)" },
    },
    {
      active: false,
      direction: "backward",
      css: { transform: "translateX(8px)" },
    },
  ],
});

/**
 * LeftSideBar displays tools and content panels.
 * Visibility is controlled by the TopBar's sidebar toggle.
 * Resizable from the right edge.
 */
export const LeftSideBar: React.FC = () => {
  const {
    isLeftSidebarOpen: isOpen,
    leftSidebarWidth,
    setLeftSidebarWidth,
    isPanelAnimating,
    isSearchOpen,
  } = use(EditorContext);

  const { keepPanelsMounted, useEntitiesTreeView } = use(UserSettingsContext);

  // The sidebar is visible when explicitly opened OR when search is active
  const isVisible = isOpen || isSearchOpen;

  const sidebarSubViews = useEntitiesTreeView
    ? LEFT_SIDEBAR_TREE_SUBVIEWS
    : LEFT_SIDEBAR_SUBVIEWS;

  const searchSubViews = useMemo(() => [searchSubView], []);

  if (!isVisible && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelBaseStyle,
        panelStyle({ open: isVisible, animating: isPanelAnimating }),
      )}
      style={{ width: leftSidebarWidth }}
      resizable={{
        edge: "right",
        size: leftSidebarWidth,
        onResize: setLeftSidebarWidth,
        minSize: MIN_LEFT_SIDEBAR_WIDTH,
        maxSize: MAX_LEFT_SIDEBAR_WIDTH,
      }}
    >
      <div className={contentWrapperStyle}>
        <div
          className={contentLayerStyle({
            active: !isSearchOpen,
            direction: "forward",
          })}
        >
          <VerticalSubViewsContainer
            name="left-sidebar"
            subViews={sidebarSubViews}
          />
        </div>
        <div
          className={contentLayerStyle({
            active: isSearchOpen,
            direction: "backward",
          })}
        >
          <VerticalSubViewsContainer
            name="left-sidebar-search"
            subViews={searchSubViews}
          />
        </div>
      </div>
    </GlassPanel>
  );
};
