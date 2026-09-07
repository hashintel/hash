import { use } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { buildCanvasFocus } from "./canvas-focus";
import { buildCanvasScene, type CanvasScene } from "./canvas-scene";
import { useDebouncedValue } from "./hooks/util/use-debounced-value";
import { HOVER_FOCUS_DELAY_MS } from "./styles/focus";

/** The scene for the active net, as the editor currently shows it. */
export const useCanvasScene = (): CanvasScene => {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { draggingStateByNodeId, isSelected, selection, hoveredItem } =
    use(EditorContext);
  const { compactNodes } = use(UserSettingsContext);

  // Trailing, so the neighbourhood only lights up once the pointer has come to
  // rest: sweeping the canvas passes over nodes without any of them flashing.
  const settledHoverId = useDebouncedValue(
    hoveredItem?.id ?? null,
    HOVER_FOCUS_DELAY_MS,
  );

  return buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    extensions,
    dimensions: compactNodes ? compactNodeDimensions : classicNodeDimensions,
    draggingStateByNodeId,
    isSelected,
    focus: buildCanvasFocus({
      net: activeNet,
      hoveredId: settledHoverId,
      selectedIds: new Set(selection.keys()),
    }),
  });
};
