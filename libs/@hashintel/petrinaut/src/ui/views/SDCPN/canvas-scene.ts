/**
 * The renderer-agnostic picture of the net: the nodes and arcs any canvas
 * renderer draws, carrying the interaction state that changes how they look.
 * Time-varying simulation state (token counts, firings) stays out of it, so a
 * playback frame never rebuilds the scene; renderers read it from the
 * execution frame source.
 */

import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
  getComponentInstanceHeight,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { arcStrokeColor } from "./styles/type-colors";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { DraggingStateByNodeId } from "../../../react/state/editor-context";
import type {
  ArcEndpoint,
  InputArcType,
  PetrinautExtensionSettings,
  RenderNodeDimensions,
  SDCPN,
} from "@hashintel/petrinaut-core";

export type CanvasPoint = { x: number; y: number };

type CanvasNodeBase = {
  id: string;
  /**
   * Centre of the node in scene coordinates. Follows the drag preview while
   * the node is being dragged, and the committed position otherwise.
   */
  position: CanvasPoint;
  width: number;
  height: number;
  label: string;
  dragging: boolean;
  selected: boolean;
  hovered: boolean;
  /**
   * Lightened because it is neither hovered, selected, nor connected to the
   * hovered or selected items.
   */
  dimmed: boolean;
};

export type CanvasPlaceNode = CanvasNodeBase & {
  kind: "place";
  dynamicsEnabled: boolean;
  hasColorType: boolean;
  /** Whether the place defines custom visualizer code. */
  hasVisualizer: boolean;
  /** Display colour of the place's token type, when it has one. */
  typeColor: string | undefined;
};

export type CanvasTransitionNode = CanvasNodeBase & {
  kind: "transition";
  lambdaType: "none" | "predicate" | "stochastic";
};

export type CanvasPort = { id: string; name: string };

export type CanvasComponentInstanceNode = CanvasNodeBase & {
  kind: "componentInstance";
  subnetName: string;
  ports: CanvasPort[];
};

export type CanvasNode =
  | CanvasPlaceNode
  | CanvasTransitionNode
  | CanvasComponentInstanceNode;

export type CanvasNodeKind = CanvasNode["kind"];

export type CanvasArc = {
  id: string;
  kind: InputArcType;
  weight: number;
  sourceId: string;
  targetId: string;
  /** The port place at either end when that end is a component instance. */
  sourcePortId: string | null;
  targetPortId: string | null;
  /** The transition whose firings animate this arc. */
  transitionId: string;
  /** Stroke colour before any dimming is applied. */
  color: string;
  selected: boolean;
  dimmed: boolean;
};

export type CanvasScene = {
  nodes: CanvasNode[];
  arcs: CanvasArc[];
  dimensions: RenderNodeDimensions;
};

export type CanvasSceneInput = {
  net: ActiveNetDefinition;
  /** The whole document, for subnet lookups. */
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  dimensions: RenderNodeDimensions;
  draggingStateByNodeId: DraggingStateByNodeId;
  isSelected: (id: string) => boolean;
  isHovered: (id: string) => boolean;
  isDimmed: (id: string) => boolean;
};

const positionOf = (
  item: { id: string; x: number; y: number },
  draggingStateByNodeId: DraggingStateByNodeId,
): { position: CanvasPoint; dragging: boolean } => {
  const draggingState = draggingStateByNodeId[item.id];
  return draggingState?.dragging
    ? { position: draggingState.position, dragging: true }
    : { position: { x: item.x, y: item.y }, dragging: false };
};

export const buildCanvasScene = ({
  net,
  sdcpn,
  extensions,
  dimensions,
  draggingStateByNodeId,
  isSelected,
  isHovered,
  isDimmed,
}: CanvasSceneInput): CanvasScene => {
  const interaction = (id: string) => ({
    selected: isSelected(id),
    hovered: isHovered(id),
    dimmed: isDimmed(id),
  });

  const typeOf = (colorId: string | null) =>
    extensions.colors && colorId
      ? net.types.find((type) => type.id === colorId)
      : undefined;

  const nodes: CanvasNode[] = [];

  for (const place of net.places) {
    const placeType = typeOf(place.colorId);
    nodes.push({
      kind: "place",
      id: place.id,
      label: place.name,
      ...dimensions.place,
      ...positionOf(place, draggingStateByNodeId),
      ...interaction(place.id),
      dynamicsEnabled:
        extensions.colors && extensions.dynamics && place.dynamicsEnabled,
      hasColorType: (placeType?.elements.length ?? 0) > 0,
      hasVisualizer: !!place.visualizerCode,
      typeColor: placeType?.displayColor,
    });
  }

  for (const transition of net.transitions) {
    const logicAvailability = getTransitionLogicAvailability(
      transition,
      sdcpn,
      extensions,
      net,
    );
    nodes.push({
      kind: "transition",
      id: transition.id,
      label: transition.name,
      ...dimensions.transition,
      ...positionOf(transition, draggingStateByNodeId),
      ...interaction(transition.id),
      lambdaType: logicAvailability.lambda
        ? getEffectiveTransitionLambdaType(transition, logicAvailability)
        : "none",
    });
  }

  for (const instance of net.componentInstances) {
    const subnet = (sdcpn.subnets ?? []).find(
      ({ id }) => id === instance.subnetId,
    );
    const ports = (subnet?.places ?? [])
      .filter((place) => place.isPort)
      .map((place) => ({ id: place.id, name: place.name }));
    nodes.push({
      kind: "componentInstance",
      id: instance.id,
      label: instance.name,
      width: dimensions.componentInstance.width,
      height: getComponentInstanceHeight(dimensions, ports.length),
      ...positionOf(instance, draggingStateByNodeId),
      ...interaction(instance.id),
      subnetName: subnet?.name ?? "Unknown subnet",
      ports,
    });
  }

  const endpointColor = (endpoint: ArcEndpoint): string | undefined => {
    if (endpoint.kind === "place") {
      const place = net.places.find(({ id }) => id === endpoint.placeId);
      return typeOf(place?.colorId ?? null)?.displayColor;
    }
    const instance = net.componentInstances.find(
      ({ id }) => id === endpoint.componentInstanceId,
    );
    const subnet = (sdcpn.subnets ?? []).find(
      ({ id }) => id === instance?.subnetId,
    );
    const port = subnet?.places.find(({ id }) => id === endpoint.portPlaceId);
    return extensions.colors && port?.colorId
      ? subnet?.types.find((type) => type.id === port.colorId)?.displayColor
      : undefined;
  };

  const portId = (endpoint: ArcEndpoint): string | null =>
    endpoint.kind === "componentPort" ? endpoint.portPlaceId : null;

  const arcs: CanvasArc[] = [];

  for (const transition of net.transitions) {
    for (const inputArc of transition.inputArcs) {
      const endpoint = getArcEndpoint(inputArc);
      const id = generateArcId({
        inputId: getArcEndpointKey(endpoint),
        outputId: transition.id,
      });
      arcs.push({
        id,
        kind: inputArc.type,
        weight: inputArc.weight,
        sourceId: getArcEndpointNodeId(endpoint),
        targetId: transition.id,
        sourcePortId: portId(endpoint),
        targetPortId: null,
        transitionId: transition.id,
        color: arcStrokeColor(endpointColor(endpoint)),
        selected: isSelected(id),
        dimmed: isDimmed(id),
      });
    }

    for (const outputArc of transition.outputArcs) {
      const endpoint = getArcEndpoint(outputArc);
      const id = generateArcId({
        inputId: transition.id,
        outputId: getArcEndpointKey(endpoint),
      });
      arcs.push({
        id,
        kind: "standard",
        weight: outputArc.weight,
        sourceId: transition.id,
        targetId: getArcEndpointNodeId(endpoint),
        sourcePortId: null,
        targetPortId: portId(endpoint),
        transitionId: transition.id,
        color: arcStrokeColor(endpointColor(endpoint)),
        selected: isSelected(id),
        dimmed: isDimmed(id),
      });
    }
  }

  return { nodes, arcs, dimensions };
};
