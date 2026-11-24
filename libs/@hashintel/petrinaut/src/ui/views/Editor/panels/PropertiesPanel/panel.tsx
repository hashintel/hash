/**
 * @layerRoot ui.views.editor.properties
 * @role Shows and edits the properties of the selected item, or of a selection of several, in the right panel
 *
 * Also imported by the preview: `selected-item-properties.tsx`.
 */

import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../react/document/active-net-context";
import { SDCPNContext } from "../../../../../react/document/sdcpn-context";
import { assistantCover } from "../../../../../react/state/panel-presence";
import { usePanelPresence } from "../../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import {
  useLastPanelTarget,
  usePanelTarget,
} from "../../../../../react/state/use-selection";
import { PANEL_MARGIN } from "../../../../shared/ui-constants";
import { DockedPanel } from "../../shared/docked-panel";
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

const glassPanelContentStyle = css({
  overflowY: "auto",
});

/**
 * The docked panel on the right: the properties of what is selected, one item
 * of the net or several at once.
 */
export const PropertiesPanel: React.FC = () => {
  const { bottomPanelHeight, aiAssistantWidth } = usePanelSizes();
  const presence = usePanelPresence();

  const { petriNetId } = use(SDCPNContext);
  const { activeComponentId } = use(ActiveNetContext);
  const panelTarget = usePanelTarget();
  // The panel slides out after the selection is gone. It shows what was
  // selected until it is out of view, and does not slide out empty.
  const shownTarget = useLastPanelTarget();

  return (
    <DockedPanel
      panel="propertiesPanel"
      isOpen={panelTarget.kind !== "none"}
      className={glassPanelStyle}
      contentClassName={glassPanelContentStyle}
      style={{ padding: PANEL_MARGIN }}
      // The panel ends above the bottom panel, with the gap there is beside
      // the left sidebar, and it makes way for an AI assistant that is
      // docking over the editor.
      boundStyle={{
        bottom: () =>
          presence.shown.bottomPanel.get() *
          (bottomPanelHeight.get() + PANEL_MARGIN),
      }}
      pushedBy={() => assistantCover(presence, aiAssistantWidth.get())}
    >
      <SelectedItemProperties
        key={JSON.stringify([petriNetId, activeComponentId])}
        panelTarget={shownTarget}
        inert={panelTarget.kind === "none"}
      />
    </DockedPanel>
  );
};
