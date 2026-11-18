import { use } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { usePanelTarget } from "../../../../../react/state/use-selection";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import {
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { styleFromStore } from "../../../../lib/style-from-store";
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
        transitionProperty:
          "[width, opacity, height, top, left, right, bottom, transform]",
        transitionDuration: "[150ms]",
        transitionTimingFunction: "[cubic-bezier(0.16, 1, 0.3, 1)]",
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
  const { isBottomPanelOpen, bottomPanelHeight, isPanelAnimating } =
    use(EditorContext);
  const { propertiesPanelWidth } = usePanelSizes();

  const { petriNetId } = use(SDCPNContext);
  const { activeComponentId } = use(ActiveNetContext);
  const panelTarget = usePanelTarget();

  const isOpen = panelTarget.kind !== "none";

  // Calculate bottom offset based on bottom panel visibility
  // Gap between PropertiesPanel and BottomPanel matches gap between LeftSideBar and BottomPanel
  const bottomOffset = isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0;

  const { keepPanelsMounted, setPropertiesPanelWidth: saveWidth } =
    use(UserSettingsContext);

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
      )}
      // The width follows the drag by a direct write, with no render.
      ref={styleFromStore(propertiesPanelWidth, (width) => ({
        width: `${width}px`,
      }))}
      style={{ bottom: bottomOffset, padding: PANEL_MARGIN }}
      contentClassName={glassPanelContentStyle}
      resizable={{
        edge: "left",
        getSize: () => propertiesPanelWidth.get(),
        onResize: (width) => propertiesPanelWidth.set(width),
        onResizeEnd: () => saveWidth(propertiesPanelWidth.get()),
        minSize: MIN_PROPERTIES_PANEL_WIDTH,
        maxSize: MAX_PROPERTIES_PANEL_WIDTH,
      }}
    >
      <SelectedItemProperties
        key={JSON.stringify([petriNetId, activeComponentId])}
      />
    </GlassPanel>
  );
};
