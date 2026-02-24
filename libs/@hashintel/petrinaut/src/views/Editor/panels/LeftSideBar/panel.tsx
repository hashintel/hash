import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import { ProportionalSubViewsContainer } from "../../../../components/sub-view/vertical/proportional-sub-views-container";
import {
  LEFT_SIDEBAR_SUBVIEWS,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import { EditorContext } from "../../../../state/editor-context";

const outerContainerStyle = css({
  position: "absolute",
  zIndex: 1002,
  display: "flex",
  top: "[0]",
  left: "[0]",
  bottom: "[0]",
  height: "[100%]",
});

const panelContentStyle = css({
  display: "flex",
  height: "[100%]",
  padding: "[16px]",
  paddingBottom: "[0]",
  flexDirection: "column",
  gap: "[4px]",
  alignItems: "stretch",
});

const glassPanelBaseStyle = css({
  borderRightWidth: "thin",
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
    <div className={outerContainerStyle}>
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
        <ProportionalSubViewsContainer subViews={LEFT_SIDEBAR_SUBVIEWS} />
      </GlassPanel>
    </div>
  );
};
