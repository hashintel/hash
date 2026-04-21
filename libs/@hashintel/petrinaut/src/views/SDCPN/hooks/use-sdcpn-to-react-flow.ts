import { MarkerType } from "@xyflow/react";
import { use } from "react";

import { hexToHsl } from "../../../lib/hsl-color";
import { PlaybackContext } from "../../../playback/context";
import { EditorContext } from "../../../state/editor-context";
import { generateArcId, SDCPNContext } from "../../../state/sdcpn-context";
import { UserSettingsContext } from "../../../state/user-settings-context";
import type {
  NodeType,
  PetrinautReactFlowDefinitionObject,
} from "../reactflow-types";
import {
  classicNodeDimensions,
  compactNodeDimensions,
  NOT_SELECTED_CONNECTION_OVERLAY_OPACITY,
} from "../styles/styling";

/**
 * Converts SDCPN state to ReactFlow format (nodes and edges), and combines
 * with the transient dragging state from the editor store.
 *
 * This hook merges the functionality of:
 * - Converting SDCPN places/transitions/arcs to ReactFlow nodes/edges
 * - Folding in the dragging state for proper rendering during drag operations
 *
 * @returns An object with nodes (including dragging state) and arcs for ReactFlow
 */
export function useSdcpnToReactFlow(): PetrinautReactFlowDefinitionObject {
  const { petriNetDefinition } = use(SDCPNContext);
  const {
    draggingStateByNodeId,
    isSelected,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);
  const { currentViewedFrame } = use(PlaybackContext);
  const { compactNodes } = use(UserSettingsContext);

  const dimensions = compactNodes
    ? compactNodeDimensions
    : classicNodeDimensions;

  const nodes: NodeType[] = [];

  // Create place nodes
  for (const place of petriNetDefinition.places) {
    const draggingState = draggingStateByNodeId[place.id];

    // Check if place has a type with at least one dimension (element)
    const placeType = place.colorId
      ? petriNetDefinition.types.find((type) => type.id === place.colorId)
      : null;
    const hasColorType = !!(placeType && placeType.elements.length > 0);

    nodes.push({
      id: place.id,
      type: "place",
      position: draggingState?.dragging
        ? draggingState.position
        : { x: place.x, y: place.y },
      width: dimensions.place.width,
      height: dimensions.place.height,
      measured: {
        width: dimensions.place.width,
        height: dimensions.place.height,
      },
      dragging: draggingState?.dragging ?? false,
      selected: isSelected(place.id),
      data: {
        label: place.name,
        type: "place",
        dynamicsEnabled: place.dynamicsEnabled,
        hasColorType,
        typeColor: placeType?.displayColor, // Pass the type color for border styling
      },
    });
  }

  // Create transition nodes
  for (const transition of petriNetDefinition.transitions) {
    const draggingState = draggingStateByNodeId[transition.id];

    nodes.push({
      id: transition.id,
      type: "transition",
      position: draggingState?.dragging
        ? draggingState.position
        : { x: transition.x, y: transition.y },
      width: dimensions.transition.width,
      height: dimensions.transition.height,
      measured: {
        width: dimensions.transition.width,
        height: dimensions.transition.height,
      },
      dragging: draggingState?.dragging ?? false,
      selected: isSelected(transition.id),
      data: {
        label: transition.name,
        type: "transition",
        lambdaType: transition.lambdaType,
        frame: currentViewedFrame?.transitions[transition.id] ?? null,
      },
    });
  }

  // Create arcs from input and output arcs
  const arcs = [];

  for (const transition of petriNetDefinition.transitions) {
    // Input arcs (from places to transition)
    for (const inputArc of transition.inputArcs) {
      const arcId = generateArcId({
        inputId: inputArc.placeId,
        outputId: transition.id,
      });

      // Get the place to determine type color
      const place = petriNetDefinition.places.find(
        (pl) => pl.id === inputArc.placeId,
      );
      const placeType = place?.colorId
        ? petriNetDefinition.types.find((type) => type.id === place.colorId)
        : null;
      let arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection)
        arcColor = `color-mix(in oklab, white ${NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100}%, ${arcColor})`;

      arcs.push({
        id: arcId,
        source: inputArc.placeId,
        target: transition.id,
        type: "default" as const,
        selected: isSelected(arcId),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: arcColor,
          width: 20,
          height: 20,
        },
        style: {
          stroke: arcColor,
          strokeWidth: 2,
        },
        data: {
          weight: inputArc.weight,
          arcType: inputArc.type,
          frame: currentViewedFrame?.transitions[transition.id] ?? null,
        },
      });
    }

    // Output arcs (from transition to places)
    for (const outputArc of transition.outputArcs) {
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: outputArc.placeId,
      });

      // Get the place to determine type color
      const place = petriNetDefinition.places.find(
        (pl) => pl.id === outputArc.placeId,
      );
      const placeType = place?.colorId
        ? petriNetDefinition.types.find((type) => type.id === place.colorId)
        : null;
      let arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection)
        arcColor = `color-mix(in oklab, white ${NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100}%, ${arcColor})`;

      arcs.push({
        id: arcId,
        source: transition.id,
        target: outputArc.placeId,
        type: "default" as const,
        selected: isSelected(arcId),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: arcColor,
          width: 20,
          height: 20,
        },
        style: {
          stroke: arcColor,
          strokeWidth: 2,
        },
        data: {
          weight: outputArc.weight,
          arcType: "standard" as const,
          frame: currentViewedFrame?.transitions[transition.id] ?? null,
        },
      });
    }
  }

  return {
    nodes,
    arcs,
  };
}
