import { use } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { assistantCover } from "../../../../../react/state/panel-presence";
import { usePanelPresence } from "../../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { usePanelTarget } from "../../../../../react/state/use-selection";
import { useUserSettingsFields } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import {
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { styleRef, useReading } from "../../../../lib/readings";
import { slideFromEdge } from "../../shared/slide-from-edge";
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
      // Where the panel is comes from its presence value; this is only what
      // a closed panel must not do.
      false: {
        pointerEvents: "none",
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
  const { propertiesPanelWidth, bottomPanelHeight, aiAssistantWidth } =
    usePanelSizes();
  const presence = usePanelPresence();
  const { shown } = presence;
  // Still sliding out, where a closed panel is not kept mounted.
  const isInView = useReading(() => shown.propertiesPanel.get() > 0);

  const { petriNetId } = use(SDCPNContext);
  const { activeComponentId } = use(ActiveNetContext);
  const panelTarget = usePanelTarget();

  const isOpen = panelTarget.kind !== "none";

  const { keepPanelsMounted, setPropertiesPanelWidth: saveWidth } =
    useUserSettingsFields("keepPanelsMounted", "setPropertiesPanelWidth");

  if (!isOpen && !isInView && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(glassPanelStyle, panelStyle({ open: isOpen }))}
      // The box follows the drags and the panels around it by direct writes,
      // with no render. It ends above the bottom panel, with the gap there is
      // beside the left sidebar, and it makes way for an AI assistant that is
      // docking over the editor.
      ref={styleRef({
        width: propertiesPanelWidth,
        bottom: () =>
          shown.bottomPanel.get() * (bottomPanelHeight.get() + PANEL_MARGIN),
        transform: () =>
          slideFromEdge(
            "right",
            shown.propertiesPanel.get(),
            assistantCover(presence, aiAssistantWidth.get()),
          ),
      })}
      style={{ padding: PANEL_MARGIN }}
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
