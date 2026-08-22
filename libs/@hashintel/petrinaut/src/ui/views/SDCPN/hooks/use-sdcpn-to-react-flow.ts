import { MarkerType } from "@xyflow/react";
import { use } from "react";

import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
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
import {
  collapsedInstanceHeight,
  computeDisplacementSources,
  computeExpansionShift,
  makeExpandedChildId,
  type ExpandedSubnetsByInstanceId,
} from "./use-expanded-subnets";

import type {
  EdgeType,
  NodeType,
  PetrinautReactFlowDefinitionObject,
} from "../reactflow-types";
import type { ArcEndpoint } from "@hashintel/petrinaut-core";

export function useSdcpnToReactFlow(
  /**
   * Component instances of the active net currently expanded in place
   * (FE-874 prototype). Empty when nothing is expanded.
   */
  expandedSubnets: ExpandedSubnetsByInstanceId = {},
): PetrinautReactFlowDefinitionObject {
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

  const subnets = fullSdcpn.subnets ?? [];

  /**
   * Display-time displacement of the net around expanded instances: stored
   * positions stay untouched, displayed positions shift to make room.
   */
  const displacementSources = computeDisplacementSources(
    petriNetDefinition.componentInstances,
    subnets,
    expandedSubnets,
    dimensions.componentInstance,
  );

  const displayPosition = (
    nodeId: string,
    modelPosition: { x: number; y: number },
  ): { x: number; y: number } => {
    if (displacementSources.length === 0) {
      return modelPosition;
    }
    const { dx, dy } = computeExpansionShift(
      displacementSources,
      nodeId,
      modelPosition,
    );
    return { x: modelPosition.x + dx, y: modelPosition.y + dy };
  };

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
        : displayPosition(place.id, { x: place.x, y: place.y }),
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
      fullSdcpn,
      extensions,
      petriNetDefinition,
    );

    nodes.push({
      id: transition.id,
      type: "transition",
      position: draggingState?.dragging
        ? draggingState.position
        : displayPosition(transition.id, { x: transition.x, y: transition.y }),
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
    const subnet = subnets.find(({ id }) => id === instance.subnetId);
    const expandedLayout = expandedSubnets[instance.id];

    if (expandedLayout && subnet) {
      // Expanded in place: a frame node whose children are the subnet's
      // internal elements, positioned by the ELK layout computed on expand.
      nodes.push({
        id: instance.id,
        type: "componentInstanceExpanded",
        position: draggingState?.dragging
          ? draggingState.position
          : displayPosition(instance.id, { x: instance.x, y: instance.y }),
        width: expandedLayout.width,
        height: expandedLayout.height,
        measured: {
          width: expandedLayout.width,
          height: expandedLayout.height,
        },
        dragging: draggingState?.dragging ?? false,
        selected: isSelected(instance.id),
        data: {
          label: instance.name,
          type: "componentInstanceExpanded",
          subnetName: subnet.name,
        },
      });

      for (const place of subnet.places) {
        const childPosition = expandedLayout.positionsByNodeId[place.id];
        if (!childPosition) {
          continue;
        }
        const placeType =
          extensions.colors && place.colorId
            ? subnet.types.find((type) => type.id === place.colorId)
            : null;
        nodes.push({
          id: makeExpandedChildId(instance.id, place.id),
          type: "place",
          parentId: instance.id,
          position: childPosition,
          width: dimensions.place.width,
          height: dimensions.place.height,
          measured: {
            width: dimensions.place.width,
            height: dimensions.place.height,
          },
          draggable: false,
          selectable: false,
          connectable: false,
          data: {
            label: place.name,
            type: "place",
            dynamicsEnabled:
              extensions.colors && extensions.dynamics && place.dynamicsEnabled,
            hasColorType: !!(placeType && placeType.elements.length > 0),
            hasVisualizer: !!place.visualizerCode,
            typeColor: placeType?.displayColor,
          },
        });
      }

      for (const transition of subnet.transitions) {
        const childPosition = expandedLayout.positionsByNodeId[transition.id];
        if (!childPosition) {
          continue;
        }
        const logicAvailability = getTransitionLogicAvailability(
          transition,
          fullSdcpn,
          extensions,
          subnet,
        );
        nodes.push({
          id: makeExpandedChildId(instance.id, transition.id),
          type: "transition",
          parentId: instance.id,
          position: childPosition,
          width: dimensions.transition.width,
          height: dimensions.transition.height,
          measured: {
            width: dimensions.transition.width,
            height: dimensions.transition.height,
          },
          draggable: false,
          selectable: false,
          connectable: false,
          data: {
            label: transition.name,
            type: "transition",
            lambdaType: logicAvailability.lambda
              ? getEffectiveTransitionLambdaType(transition, logicAvailability)
              : "none",
            frame: null,
          },
        });
      }

      for (const nested of subnet.componentInstances ?? []) {
        const childPosition = expandedLayout.positionsByNodeId[nested.id];
        if (!childPosition) {
          continue;
        }
        const nestedSubnet = subnets.find(({ id }) => id === nested.subnetId);
        const nestedPorts = (nestedSubnet?.places ?? [])
          .filter((place) => place.isPort)
          .map((place) => ({ id: place.id, name: place.name }));
        nodes.push({
          id: makeExpandedChildId(instance.id, nested.id),
          type: "componentInstance",
          parentId: instance.id,
          position: childPosition,
          width: dimensions.componentInstance.width,
          height: collapsedInstanceHeight(
            dimensions.componentInstance.height,
            nestedPorts.length,
          ),
          measured: {
            width: dimensions.componentInstance.width,
            height: collapsedInstanceHeight(
              dimensions.componentInstance.height,
              nestedPorts.length,
            ),
          },
          draggable: false,
          selectable: false,
          connectable: false,
          data: {
            label: nested.name,
            type: "componentInstance",
            subnetName: nestedSubnet?.name ?? "Unknown subnet",
            ports: nestedPorts,
          },
        });
      }

      continue;
    }

    const ports = (subnet?.places ?? [])
      .filter((place) => place.isPort)
      .map((place) => ({ id: place.id, name: place.name }));
    const portBasedHeight = collapsedInstanceHeight(
      dimensions.componentInstance.height,
      ports.length,
    );

    nodes.push({
      id: instance.id,
      type: "componentInstance",
      position: draggingState?.dragging
        ? draggingState.position
        : displayPosition(instance.id, { x: instance.x, y: instance.y }),
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

  /**
   * Resolves the React Flow node + handle an arc endpoint attaches to.
   * A componentPort endpoint normally attaches to a port handle on the
   * collapsed instance box; when the instance is expanded it attaches
   * directly to the port place rendered inside the frame.
   */
  const resolveEndpointRef = (
    endpoint: ArcEndpoint,
    direction: "in" | "out",
  ): { nodeId: string; handleId: string | undefined } => {
    if (endpoint.kind === "componentPort") {
      if (expandedSubnets[endpoint.componentInstanceId]) {
        return {
          nodeId: makeExpandedChildId(
            endpoint.componentInstanceId,
            endpoint.portPlaceId,
          ),
          handleId: undefined,
        };
      }
      return {
        nodeId: endpoint.componentInstanceId,
        handleId: `port-${direction}-${endpoint.portPlaceId}`,
      };
    }
    return { nodeId: endpoint.placeId, handleId: undefined };
  };

  const getEndpointColor = (
    endpoint: ReturnType<typeof getArcEndpoint>,
  ): string | undefined => {
    if (endpoint.kind === "place") {
      const place = petriNetDefinition.places.find(
        (pl) => pl.id === endpoint.placeId,
      );
      return extensions.colors && place?.colorId
        ? petriNetDefinition.types.find((type) => type.id === place.colorId)
            ?.displayColor
        : undefined;
    }

    const instance = petriNetDefinition.componentInstances.find(
      ({ id }) => id === endpoint.componentInstanceId,
    );
    const subnet = (fullSdcpn.subnets ?? []).find(
      ({ id }) => id === instance?.subnetId,
    );
    const port = subnet?.places.find(
      (place) => place.id === endpoint.portPlaceId,
    );
    return extensions.colors && port?.colorId
      ? subnet?.types.find((type) => type.id === port.colorId)?.displayColor
      : undefined;
  };

  for (const transition of petriNetDefinition.transitions) {
    for (const inputArc of transition.inputArcs) {
      const endpoint = getArcEndpoint(inputArc);
      const arcId = generateArcId({
        inputId: getArcEndpointKey(endpoint),
        outputId: transition.id,
      });
      const endpointColor = getEndpointColor(endpoint);
      let arcColor = endpointColor
        ? hexToHsl(endpointColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection) {
        arcColor = `color-mix(in oklab, white ${
          NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100
        }%, ${arcColor})`;
      }

      const sourceRef = resolveEndpointRef(endpoint, "out");

      edges.push({
        id: arcId,
        source: sourceRef.nodeId,
        sourceHandle: sourceRef.handleId,
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
      const endpoint = getArcEndpoint(outputArc);
      const arcId = generateArcId({
        inputId: transition.id,
        outputId: getArcEndpointKey(endpoint),
      });
      const endpointColor = getEndpointColor(endpoint);
      let arcColor = endpointColor
        ? hexToHsl(endpointColor).lighten(-15).saturate(-30).css(1)
        : "#777";

      const notSelectedConnection =
        isNotHoveredConnection(arcId) ||
        (!hoveredItem && isNotSelectedConnection(arcId));
      if (notSelectedConnection) {
        arcColor = `color-mix(in oklab, white ${
          NOT_SELECTED_CONNECTION_OVERLAY_OPACITY * 100
        }%, ${arcColor})`;
      }

      const targetRef = resolveEndpointRef(endpoint, "in");

      edges.push({
        id: arcId,
        source: transition.id,
        target: targetRef.nodeId,
        targetHandle: targetRef.handleId,
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

  // Internal arcs of expanded instances, namespaced by instance id so two
  // instances of the same subnet don't collide. Not selectable — they are a
  // read-only projection of the subnet definition.
  for (const instance of petriNetDefinition.componentInstances) {
    const expandedLayout = expandedSubnets[instance.id];
    const subnet = subnets.find(({ id }) => id === instance.subnetId);
    if (!expandedLayout || !subnet) {
      continue;
    }

    const getSubnetEndpointColor = (
      endpoint: ReturnType<typeof getArcEndpoint>,
    ): string | undefined => {
      if (endpoint.kind !== "place" || !extensions.colors) {
        return undefined;
      }
      const place = subnet.places.find((pl) => pl.id === endpoint.placeId);
      return place?.colorId
        ? subnet.types.find((type) => type.id === place.colorId)?.displayColor
        : undefined;
    };

    for (const transition of subnet.transitions) {
      const transitionChildId = makeExpandedChildId(instance.id, transition.id);

      for (const inputArc of transition.inputArcs) {
        const endpoint = getArcEndpoint(inputArc);
        const endpointColor = getSubnetEndpointColor(endpoint);
        const arcColor = endpointColor
          ? hexToHsl(endpointColor).lighten(-15).saturate(-30).css(1)
          : "#777";

        edges.push({
          id: makeExpandedChildId(
            instance.id,
            generateArcId({
              inputId: getArcEndpointKey(endpoint),
              outputId: transition.id,
            }),
          ),
          source: makeExpandedChildId(
            instance.id,
            getArcEndpointNodeId(endpoint),
          ),
          sourceHandle:
            endpoint.kind === "componentPort"
              ? `port-out-${endpoint.portPlaceId}`
              : undefined,
          target: transitionChildId,
          type: "default",
          selectable: false,
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
            frame: null,
          },
        });
      }

      for (const outputArc of transition.outputArcs) {
        const endpoint = getArcEndpoint(outputArc);
        const endpointColor = getSubnetEndpointColor(endpoint);
        const arcColor = endpointColor
          ? hexToHsl(endpointColor).lighten(-15).saturate(-30).css(1)
          : "#777";

        edges.push({
          id: makeExpandedChildId(
            instance.id,
            generateArcId({
              inputId: transition.id,
              outputId: getArcEndpointKey(endpoint),
            }),
          ),
          source: transitionChildId,
          target: makeExpandedChildId(
            instance.id,
            getArcEndpointNodeId(endpoint),
          ),
          targetHandle:
            endpoint.kind === "componentPort"
              ? `port-in-${endpoint.portPlaceId}`
              : undefined,
          type: "default",
          selectable: false,
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
            frame: null,
          },
        });
      }
    }
  }

  return {
    nodes,
    edges,
  };
}
