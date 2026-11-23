import { use, useEffect, useState } from "react";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/document/active-net-context";
import { CompositionContext } from "../../../react/document/composition-context";
import { SDCPNContext } from "../../../react/document/sdcpn-context";
import { useStore } from "../../../react/shared/use-store";
import { useEditorFields } from "../../../react/state/editor-context";
import { useUserSettingsFields } from "../../../react/state/user-settings-context";
import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";
import {
  buildCanvasScene,
  transitionLambdaTypes,
  type CanvasScene,
} from "./canvas-scene";
import { fusionSeverities } from "./fusion-links";
import { usePointerAtRest } from "./hooks/util/use-pointer-at-rest";

import type { ActiveNetDefinition } from "../../../react/document/active-net-context";
import type { CanvasPointer } from "./canvas-pointer";
import type {
  PetrinautExtensionSettings,
  ResolvedLibraries,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * What the scene takes from the net alone: who neighbours whom, the worst
 * problem of each fusion and how each transition gives its rate. A hook of
 * its own, so that each is kept while the net is: a value built inside
 * `useCanvasScene` and handed to the scene is built again with it, for every
 * drag frame, selection and settled hover.
 */
const useNetIndex = (
  sdcpn: SDCPN,
  net: ActiveNetDefinition,
  activeComponentId: string | null,
  libraries: ResolvedLibraries,
  extensions: PetrinautExtensionSettings,
) => {
  // The compiler takes a hook that calls no hook only when asked.
  "use memo";
  return {
    adjacency: buildNetAdjacency(net),
    severities: fusionSeverities(sdcpn, net, activeComponentId, libraries),
    lambdaTypes: transitionLambdaTypes(net, sdcpn, extensions, libraries),
  };
};

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
  // By name: the editor context and the settings also change with each
  // panel that opens, and a new value here builds a new scene.
  const {
    selection,
    keptOpenVisualizerPlaceIds,
    openVisualizerPlaceId,
    focusedVisualizerPlaceId,
    unfoldedComponentInstanceIds,
  } = useEditorFields(
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
  const { adjacency, severities, lambdaTypes } = useNetIndex(
    petriNetDefinition,
    activeNet,
    activeComponentId,
    libraries,
    extensions,
  );

  /*
   * The hover follows the pointer only once it stops. Sweeping across the
   * canvas passes over nodes without lighting any of them up, and what
   * settles is whatever the pointer came to rest on rather than everything it
   * crossed to get there. Dragging settles the grabbed node immediately and
   * keeps it hovered until the drag ends, even when the pointer leaves it.
   */
  const hoveredId = useStore(pointer.hoveredId);
  const dragPreview = useStore(pointer.dragPreview);
  const pointerAtRest = usePointerAtRest(canvasRef);
  const [settledHoverId, setSettledHoverId] = useState(hoveredId);
  const draggedHoverId =
    hoveredId !== null && dragPreview.has(hoveredId)
      ? hoveredId
      : settledHoverId !== null && dragPreview.has(settledHoverId)
        ? settledHoverId
        : null;
  const nextHoverId =
    draggedHoverId ?? (pointerAtRest ? hoveredId : settledHoverId);
  if (settledHoverId !== nextHoverId) {
    setSettledHoverId(nextHoverId);
  }

  // With the highlight off, the neighbourhood answers to the selection
  // alone, and a hover that settles builds no scene.
  const focusHoverId = highlightOnHover ? settledHoverId : null;

  // The hover reaches the scene before it settles only where that shows at
  // once: on a place with a visualizer. The pointer crossing any other node
  // leaves every input of the scene as it was, and no scene is built.
  const hoveredVisualizerId =
    activeNet.places.find((place) => place.id === hoveredId)?.visualizerCode ===
    undefined
      ? null
      : hoveredId;

  // An item that leaves the net is not left by the pointer: no event clears
  // its hover, and it would be lit again when an undo brings it back.
  useEffect(() => {
    if (hoveredId !== null && !adjacency.canvasIds.has(hoveredId)) {
      pointer.hoveredId.set(null);
    }
  }, [adjacency, hoveredId, pointer]);

  const selectedIds = new Set(selection.keys());

  return buildCanvasScene({
    net: activeNet,
    sdcpn: petriNetDefinition,
    libraries,
    fusionSeverities: severities,
    lambdaTypes,
    extensions,
    dimensions: compactNodes ? compactNodeDimensions : classicNodeDimensions,
    dragPreview,
    selectedIds,
    focus: resolveCanvasFocus({
      adjacency,
      hoveredId: focusHoverId,
      selectedIds,
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
