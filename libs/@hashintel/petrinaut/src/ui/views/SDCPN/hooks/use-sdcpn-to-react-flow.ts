import { MarkerType } from "@xyflow/react";
import { use } from "react";

import {
  generateArcId,
  generateWireId,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { ActiveNetContext } from "../../../../react/state/active-net-context";
import { EditorContext } from "../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";
import { hexToHsl } from "../../../lib/hsl-color";
import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "../node-dimensions";
import { NOT_SELECTED_CONNECTION_OVERLAY_OPACITY } from "../styles/styling";

import type {
  EdgeType,
  NodeType,
  PetrinautReactFlowDefinitionObject,
} from "../reactflow-types";

export function useSdcpnToReactFlow(): PetrinautReactFlowDefinitionObject {
  const { activeNet: petriNetDefinition } = use(ActiveNetContext);
  const { extensions, petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const {
    draggingStateByNodeId,
    isSelected,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);
  const { currentFrameReader } = use(ExecutionFrameSourceContext);
  const { compactNodes } = use(UserSettingsContext);

  const dimensions = compactNodes
    ? compactNodeDimensions
    : classicNodeDimensions;

  const nodes: NodeType[] = [];

  for (const place of petriNetDefinition.places) {
    const draggingState = draggingStateByNodeId[place.id];

    // Check if place has a type with at least one dimension (element)
    const placeType =
      extensions.colors && place.colorId
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
        dynamicsEnabled:
          extensions.colors && extensions.dynamics && place.dynamicsEnabled,
        hasColorType,
        hasVisualizer: !!place.visualizerCode,
        typeColor: placeType?.displayColor, // Pass the type color for border styling
      },
    });
  }

  for (const transition of petriNetDefinition.transitions) {
    const draggingState = draggingStateByNodeId[transition.id];
    const logicAvailability = getTransitionLogicAvailability(
      transition,
      petriNetDefinition,
      extensions,
    );

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
        lambdaType: logicAvailability.lambda
          ? getEffectiveTransitionLambdaType(transition, logicAvailability)
          : "none",
        frame: currentFrameReader?.getTransitionState(transition.id) ?? null,
      },
    });
  }

  for (const instance of petriNetDefinition.componentInstances) {
    const draggingState = draggingStateByNodeId[instance.id];
    const subnet = (fullSdcpn.subnets ?? []).find(
      ({ id }) => id === instance.subnetId,
    );
    const ports = (subnet?.places ?? [])
      .filter((place) => place.isPort)
      .map((place) => ({ id: place.id, name: place.name }));
    const minHeight = dimensions.componentInstance.height;
    const portBasedHeight = Math.max(minHeight, ports.length * 28 + 28);

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
        subnetName: subnet?.name ?? "Unknown subnet",
        ports,
      },
    });
  }

  const edges: EdgeType[] = [];

  for (const transition of petriNetDefinition.transitions) {
    for (const inputArc of transition.inputArcs) {
      const arcId = generateArcId({
        inputId: inputArc.placeId,
        outputId: transition.id,
      });
      const place = petriNetDefinition.places.find(
        (pl) => pl.id === inputArc.placeId,
      );
      const placeType =
        extensions.colors && place?.colorId
          ? petriNetDefinition.types.find((type) => type.id === place.colorId)
          : null;
      let arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection) {
        arcColor = `color-mix(in oklab, white ${NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100}%, ${arcColor})`;
      }

      edges.push({
        id: arcId,
        source: inputArc.placeId,
        target: transition.id,
        type: "default",
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
          frame: currentFrameReader?.getTransitionState(transition.id) ?? null,
        },
      });
    }

    for (const outputArc of transition.outputArcs) {
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: outputArc.placeId,
      });
      const place = petriNetDefinition.places.find(
        (pl) => pl.id === outputArc.placeId,
      );
      const placeType =
        extensions.colors && place?.colorId
          ? petriNetDefinition.types.find((type) => type.id === place.colorId)
          : null;
      let arcColor = placeType?.displayColor
        ? hexToHsl(placeType.displayColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection) {
        arcColor = `color-mix(in oklab, white ${NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100}%, ${arcColor})`;
      }

      edges.push({
        id: arcId,
        source: transition.id,
        target: outputArc.placeId,
        type: "default",
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
          arcType: "standard",
          frame: currentFrameReader?.getTransitionState(transition.id) ?? null,
        },
      });
    }
  }

  for (const instance of petriNetDefinition.componentInstances) {
    for (const wire of instance.wiring) {
      const wireId = generateWireId({ instanceId: instance.id, ...wire });

      edges.push({
        id: wireId,
        source: wire.externalPlaceId,
        target: instance.id,
        targetHandle: `port-in-${wire.internalPlaceId}`,
        type: "wire",
        selected: isSelected(wireId),
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
