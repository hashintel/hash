import { use } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { buildCanvasScene, type CanvasScene } from "./canvas-scene";

/** The scene for the active net, as the editor currently shows it. */
export const useCanvasScene = (): CanvasScene => {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const {
    draggingStateByNodeId,
    isSelected,
    isHovered,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);

  return buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    extensions,
    dimensions: compactNodes ? compactNodeDimensions : classicNodeDimensions,
    draggingStateByNodeId,
    isSelected,
    isHovered,
    isDimmed: (id) =>
      isNotHoveredConnection(id) ||
      (!hoveredItem && isNotSelectedConnection(id)),
  });
};
