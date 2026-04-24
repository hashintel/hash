import { MarkerType } from "@xyflow/react";
import { use } from "react";

import { hexToHsl } from "../../../lib/hsl-color";
import { PlaybackContext } from "../../../playback/context";
import { ActiveNetContext } from "../../../state/active-net-context";
import { EditorContext } from "../../../state/editor-context";
import { generateArcId, SDCPNContext } from "../../../state/sdcpn-context";
import { UserSettingsContext } from "../../../state/user-settings-context";
import type {
  EdgeType,
  NodeType,
  PetrinautReactFlowDefinitionObject,
} from "../reactflow-types";
import {
  classicNodeDimensions,
  compactNodeDimensions,
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
  const { activeNet: petriNetDefinition } = use(ActiveNetContext);
  const { petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const { draggingStateByNodeId, isSelected } = use(EditorContext);
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

  // Create component instance nodes
  for (const instance of petriNetDefinition.componentInstances) {
    const draggingState = draggingStateByNodeId[instance.id];

    // Resolve the subnet to find its port places
    const subnet = (fullSdcpn.subnets ?? []).find(
      (s) => s.id === instance.subnetId,
    );
    const subnetName = subnet?.name ?? "Unknown";
    const ports = (subnet?.places ?? [])
      .filter((place) => place.isPort)
      .map((place) => ({ id: place.id, name: place.name }));

    // Dynamically size based on port count
    const minHeight = dimensions.componentInstance.height;
    const portBasedHeight = Math.max(minHeight, ports.length * 28 + 24);

    nodes.push({
      id: instance.id,
      type: "componentInstance",
      position: draggingState?.dragging
        ? draggingState.position
        : { x: instance.x, y: instance.y },
      width: dimensions.componentInstance.width,
      height: portBasedHeight,
      measured: {
        width: dimensions.componentInstance.width,
        height: portBasedHeight,
      },
      dragging: draggingState?.dragging ?? false,
      selected: isSelected(instance.id),
      data: {
        label: instance.name,
        type: "componentInstance",
        subnetName,
        ports,
      },
    });
  }

  // Create edges (arcs + wires)
  const edges: EdgeType[] = [];

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
      const arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      edges.push({
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
      const arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      edges.push({
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

  // Create wire edges from component instance wiring (external place ↔ instance port)
  for (const instance of petriNetDefinition.componentInstances) {
    for (const wire of instance.wiring) {
      const wireId = `wire__${instance.id}__${wire.externalPlaceId}__${wire.internalPlaceId}`;

      edges.push({
        id: wireId,
        source: wire.externalPlaceId,
        target: instance.id,
        targetHandle: `port-in-${wire.internalPlaceId}`,
        type: "wire" as const,
        selected: isSelected(wireId),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#999",
          width: 20,
          height: 20,
        },
        data: {
          externalPlaceId: wire.externalPlaceId,
          internalPlaceId: wire.internalPlaceId,
        },
      });
    }
  }

  return {
    nodes,
    edges,
  };
}
