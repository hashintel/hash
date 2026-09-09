import { use, useState } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import { buildCanvasScene, type CanvasScene } from "./canvas-scene";
import { usePointerAtRest } from "./hooks/util/use-pointer-at-rest";

/**
 * The scene for the active net, as the editor currently shows it. Takes the
 * canvas element so the highlight can wait for the pointer to stop moving
 * over it.
 */
export const useCanvasScene = (
  canvasRef: React.RefObject<HTMLElement | null>,
): CanvasScene => {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { draggingStateByNodeId, isSelected, selection, hoveredItem } =
    use(EditorContext);
  const { compactNodes, highlightOnHover } = use(UserSettingsContext);

  /*
   * The hover follows the pointer only once it stops. Sweeping across the
   * canvas passes over nodes without lighting any of them up, and what
   * settles is whatever the pointer came to rest on rather than everything it
   * crossed to get there.
   */
  const hoveredId = hoveredItem?.id ?? null;
  const pointerAtRest = usePointerAtRest(canvasRef);
  const [settledHoverId, setSettledHoverId] = useState(hoveredId);
  if (pointerAtRest && settledHoverId !== hoveredId) {
    setSettledHoverId(hoveredId);
  }

  // Indexed on the net alone, so the compiler holds it across the renders a
  // hover causes and only rebuilds it when the net itself changes.
  const adjacency = buildNetAdjacency(activeNet);

  return buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    extensions,
    dimensions: compactNodes ? compactNodeDimensions : classicNodeDimensions,
    draggingStateByNodeId,
    isSelected,
    hoveredId: settledHoverId,
    // With the highlight off, the neighbourhood answers to the selection
    // alone; the hover still reaches the node it rests on.
    focus: resolveCanvasFocus({
      adjacency,
      hoveredId: highlightOnHover ? settledHoverId : null,
      selectedIds: new Set(selection.keys()),
    }),
  });
};
