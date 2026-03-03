import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import {
  LEFT_SIDEBAR_SUBVIEWS,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import { EditorContext } from "../../../../state/editor-context";
import { UserSettingsContext } from "../../../../state/user-settings-context";

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
      true: {
        transform: "translateX(0)",
      },
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
  } = use(EditorContext);

  const { keepPanelsMounted } = use(UserSettingsContext);

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelBaseStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
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
      <VerticalSubViewsContainer subViews={LEFT_SIDEBAR_SUBVIEWS} />
    </GlassPanel>
  );
};
