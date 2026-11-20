import { use, useState } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { CompositionContext } from "../../../react/state/composition-context";
import { useEditorFields } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useUserSettingsFields } from "../../../react/state/user-settings-context";
import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import { useValueOf, type CanvasPointer } from "./canvas-pointer";
import { buildCanvasScene, type CanvasScene } from "./canvas-scene";
import { fusionStatuses } from "./fusion-links";
import { usePointerAtRest } from "./hooks/util/use-pointer-at-rest";

/**
 * The scene for the active net, as the editor currently shows it. Takes the
 * canvas element so the highlight can wait for the pointer to stop moving
 * over it, and the canvas' pointer for the hover and the drag preview.
 */
export const useCanvasScene = (
  canvasRef: React.RefObject<HTMLElement | null>,
  pointer: CanvasPointer,
): CanvasScene => {
  const { activeNet, activeComponentId } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);
  // By name: the scene is built again whenever this hook's component
  // renders, and the editor context and the settings also change with each
  // panel that opens.
  const {
    isSelected,
    selection,
    keptOpenVisualizerPlaceIds,
    openVisualizerPlaceId,
    focusedVisualizerPlaceId,
    unfoldedComponentInstanceIds,
  } = useEditorFields(
    "isSelected",
    "selection",
    "keptOpenVisualizerPlaceIds",
    "openVisualizerPlaceId",
    "focusedVisualizerPlaceId",
    "unfoldedComponentInstanceIds",
  );
  const { compactNodes, highlightOnHover } = useUserSettingsFields(
    "compactNodes",
    "highlightOnHover",
  );

  /*
   * The hover follows the pointer only once it stops. Sweeping across the
   * canvas passes over nodes without lighting any of them up, and what
   * settles is whatever the pointer came to rest on rather than everything it
   * crossed to get there. Dragging settles the grabbed node immediately and
   * keeps it hovered until the drag ends, even when the pointer leaves it.
   */
  const hoveredId = useValueOf(pointer.hoveredId);
  const draggingStateByNodeId = useValueOf(pointer.dragPreview);
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

  // The hover reaches the scene before it settles only where that shows at
  // once: on a place with a visualizer. The pointer crossing any other node
  // leaves every input of the scene as it was, and no scene is built.
  const hoveredVisualizerId =
    activeNet.places.find((place) => place.id === hoveredId)?.visualizerCode ===
    undefined
      ? null
      : hoveredId;

  // Indexed and checked on the net alone, so the compiler holds both across
  // the renders a hover causes and only redoes them when the net changes.
  const adjacency = buildNetAdjacency(activeNet);
  const statuses = fusionStatuses(
    petriNetDefinition,
    activeNet,
    activeComponentId,
    libraries,
  );

  return buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    libraries,
    fusionStatuses: statuses,
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
    keptOpenVisualizerIds: keptOpenVisualizerPlaceIds,
    activeVisualizerIds: new Set(
      [
        hoveredVisualizerId,
        openVisualizerPlaceId,
        focusedVisualizerPlaceId,
      ].filter((id) => id !== null),
    ),
    unfoldedInstanceIds: unfoldedComponentInstanceIds,
  });
};
