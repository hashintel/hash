import { use } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../react/state/editor-context";
import { usePanelTarget } from "../../../../../react/state/use-selection";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import {
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { SelectedItemProperties } from "./selected-item-properties";

const glassPanelStyle = css({
  position: "absolute",
  boxSizing: "border-box",
  top: "[0]",
  right: "[0]",
  zIndex: "[calc(var(--z-index-sticky) - 3)]",
  pointerEvents: "auto",
  borderLeftWidth: "thin",
});

const panelStyle = cva({
  base: {},
  variants: {
    open: {
      true: {},
      false: {
        transform: "translateX(100%)",
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

const glassPanelContentStyle = css({
  overflowY: "auto",
});

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const {
    propertiesPanelWidth,
    setPropertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    isPanelAnimating,
  } = use(EditorContext);

  const panelTarget = usePanelTarget();

  const isOpen = panelTarget.kind !== "none";

  // Calculate bottom offset based on bottom panel visibility
  // Gap between PropertiesPanel and BottomPanel matches gap between LeftSideBar and BottomPanel
  const bottomOffset = isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0;

  const { keepPanelsMounted } = use(UserSettingsContext);

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
      )}
      style={{
        bottom: bottomOffset,
        padding: PANEL_MARGIN,
        width: propertiesPanelWidth,
      }}
      contentClassName={glassPanelContentStyle}
      resizable={{
        edge: "left",
        size: propertiesPanelWidth,
        onResize: setPropertiesPanelWidth,
        minSize: MIN_PROPERTIES_PANEL_WIDTH,
        maxSize: MAX_PROPERTIES_PANEL_WIDTH,
      }}
    >
      <SelectedItemProperties />
    </GlassPanel>
  );
};
