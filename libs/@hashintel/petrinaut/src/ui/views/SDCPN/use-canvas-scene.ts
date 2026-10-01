import { use, useState } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { resolveControllerFocus } from "../../controller-prototype/controller-focus";
import { useLeverPreview } from "../../controller-prototype/lever-preview";
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
  const {
    draggingStateByNodeId,
    isSelected,
    selection,
    hoveredItem,
    pinnedVisualizerPlaceIds,
  } = use(EditorContext);
  const { compactNodes, highlightOnHover } = use(UserSettingsContext);
  const leverPreviewId = useLeverPreview();

  /*
   * The hover follows the pointer only once it stops. Sweeping across the
   * canvas passes over nodes without lighting any of them up, and what
   * settles is whatever the pointer came to rest on rather than everything it
   * crossed to get there. Dragging settles the grabbed node immediately and
   * keeps it hovered until the drag ends, even when the pointer leaves it.
   */
  const hoveredId = hoveredItem?.id ?? null;
  const pointerAtRest = usePointerAtRest(canvasRef);
  const [settledHoverId, setSettledHoverId] = useState(hoveredId);
  const draggedHoverId =
    hoveredId !== null && draggingStateByNodeId[hoveredId]?.dragging
      ? hoveredId
      : settledHoverId !== null &&
          draggingStateByNodeId[settledHoverId]?.dragging
        ? settledHoverId
        : null;
  const nextHoverId =
    draggedHoverId ?? (pointerAtRest ? hoveredId : settledHoverId);
  if (settledHoverId !== nextHoverId) {
    setSettledHoverId(nextHoverId);
  }

  // Indexed on the net alone, so the compiler holds it across the renders a
  // hover causes and only rebuilds it when the net itself changes.
  const adjacency = buildNetAdjacency(activeNet);

  // A selected controller leaves the net as it is, so any node can be dragged
  // onto its levers; hovering a lever row or dropdown row rings that node.
  const controllerSelected = Array.from(selection.values()).some(
    (item) => item.type === "controller",
  );
  const selectedNodeIds = new Set(
    Array.from(selection.values())
      .filter((item) => item.type !== "controller")
      .map((item) => item.id),
  );

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
    focus:
      leverPreviewId !== null
        ? resolveControllerFocus(new Set([leverPreviewId]))
        : resolveCanvasFocus({
            adjacency,
            // While a controller is open, pointing at the canvas (to drag a
            // node onto a lever) focuses nothing.
            hoveredId:
              highlightOnHover && !controllerSelected ? settledHoverId : null,
            selectedIds: selectedNodeIds,
          }),
    pinnedVisualizerIds: pinnedVisualizerPlaceIds,
  });
};
