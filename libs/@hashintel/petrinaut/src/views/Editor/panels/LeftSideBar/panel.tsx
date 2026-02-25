import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import {
  LEFT_SIDEBAR_SUBVIEWS,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import { EditorContext } from "../../../../state/editor-context";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: 1002,
  top: "0",
  left: "0",
  bottom: "0",
  height: "full",
  borderRightWidth: "thin",
  boxSizing: "border-box",
  padding: "2",
  pt: "3",
  pb: "0",
});

const panelContentStyle = css({
  display: "flex",
  height: "[100%]",
  paddingBottom: "[0]",
  flexDirection: "column",
  gap: "[4px]",
  alignItems: "stretch",
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
  } = use(EditorContext);

  if (!isOpen) {
    return null;
  }

  return (
    <GlassPanel
      className={glassPanelBaseStyle}
      style={{ width: leftSidebarWidth }}
      contentClassName={panelContentStyle}
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
