/**
 * The renderer-agnostic picture of the net: the nodes and arcs any canvas
 * renderer draws, carrying the interaction state that changes how they look.
 * Time-varying simulation state (token counts, firings) stays out of it, so a
 * playback frame never rebuilds the scene; renderers read it from the
 * execution frame source.
 */

import {
  checkFusion,
  effectivePortDirection,
  fusionDisplayName,
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
  getComponentInstanceHeight,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  resolveFusionMember,
} from "@hashintel/petrinaut-core";

import { fusionHub, fusionLinkId } from "./fusion-links";
import { arcStrokeColor } from "./styles/type-colors";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { DraggingStateByNodeId } from "../../../react/state/editor-context";
import type {
  CanvasArcFocus,
  CanvasFocus,
  CanvasNodeFocus,
} from "./canvas-focus";
import type {
  ArcEndpoint,
  FusionMember,
  InputArcType,
  PetrinautExtensionSettings,
  PortDirection,
  ProblemSeverity,
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
  /** Where this node stands relative to the focused item. */
  focus: CanvasNodeFocus;
};

export type CanvasPlaceNode = CanvasNodeBase & {
  kind: "place";
  dynamicsEnabled: boolean;
  hasColorType: boolean;
  /** Whether the place defines custom visualizer code. */
  hasVisualizer: boolean;
  /** Whether its visualizer is pinned open, so it shows without a hover. */
  visualizerPinned: boolean;
  /** Display colour of the place's token type, when it has one. */
  typeColor: string | undefined;
};

export type CanvasTransitionNode = CanvasNodeBase & {
  kind: "transition";
  lambdaType: "none" | "predicate" | "stochastic";
};

export type CanvasPort = {
  id: string;
  name: string;
  /** Which way tokens cross the port, as the component declares or uses it. */
  direction: PortDirection;
};

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
  /** Stroke colour before the focus role recolours it. */
  color: string;
  selected: boolean;
  /** Where this arc stands relative to the focused item. */
  focus: CanvasArcFocus;
};

/**
 * One line of a fusion: from the fusion's hub, its anchor place or first
 * member, to one of its other members. A fusion with three members draws two
 * links; every link selects and hovers the fusion as a whole.
 */
export type CanvasFusionLink = {
  /** Unique per link: the fusion id and the member the link leads to. */
  id: string;
  fusionId: string;
  /** The fused place's name, shown on the link when selected or hovered. */
  name: string;
  sourceId: string;
  targetId: string;
  /** The port place at either end when that end is a component instance. */
  sourcePortId: string | null;
  targetPortId: string | null;
  selected: boolean;
  /** The worst of the fusion's problems, or `null` when it has none. */
  severity: ProblemSeverity | null;
  focus: CanvasArcFocus;
};

export type CanvasScene = {
  nodes: CanvasNode[];
  arcs: CanvasArc[];
  fusions: CanvasFusionLink[];
  dimensions: RenderNodeDimensions;
  /**
   * Whether anything is focused. Drives the muting of everything outside the
   * neighbourhood from the pane, so a hover leaves the other items untouched.
   */
  focusActive: boolean;
};

export type CanvasSceneInput = {
  net: ActiveNetDefinition;
  /** The subnet `net` is, or `null` for the root net. */
  activeSubnetId: string | null;
  /** The whole document, for subnet lookups. */
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  dimensions: RenderNodeDimensions;
  draggingStateByNodeId: DraggingStateByNodeId;
  isSelected: (id: string) => boolean;
  /** The node under the pointer, once the hover has settled. */
  hoveredId: string | null;
  focus: CanvasFocus;
  /** Places whose state visualizer is pinned open. */
  pinnedVisualizerIds: ReadonlySet<string>;
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

const severityRank: Record<ProblemSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

type FusionEnd = {
  member: FusionMember;
  nodeId: string;
  portId: string | null;
  /** Whether tokens can leave through this end, so it can draw as the source. */
  gives: boolean;
  /** Whether tokens can enter through this end, so it can draw as the target. */
  takes: boolean;
};

const buildFusionLinks = ({
  fusion,
  net,
  sdcpn,
  activeSubnetId,
  selected,
  focus,
}: {
  fusion: ActiveNetDefinition["fusions"][number];
  net: ActiveNetDefinition;
  sdcpn: SDCPN;
  activeSubnetId: string | null;
  selected: boolean;
  focus: CanvasFocus;
}): CanvasFusionLink[] => {
  const problems = checkFusion(sdcpn, net, fusion, activeSubnetId);
  const severity = problems.reduce<ProblemSeverity | null>(
    (worst, problem) =>
      worst === null || severityRank[problem.severity] > severityRank[worst]
        ? problem.severity
        : worst,
    null,
  );
  const name = fusionDisplayName(sdcpn, net, fusion);

  const endOf = (member: FusionMember): FusionEnd => {
    if (member.kind === "place") {
      return {
        member,
        nodeId: member.placeId,
        portId: null,
        gives: true,
        takes: true,
      };
    }
    const resolved = resolveFusionMember(sdcpn, net, member);
    const direction =
      resolved?.kind === "port"
        ? effectivePortDirection(resolved.subnet, resolved.place)
        : "inout";
    return {
      member,
      nodeId: member.componentInstanceId,
      portId: member.portPlaceId,
      gives: direction !== "in",
      takes: direction !== "out",
    };
  };

  const hubMember = fusionHub(fusion);
  if (hubMember === undefined) {
    return [];
  }
  const hub = endOf(hubMember);

  return fusion.members
    .filter((member) => member !== hubMember)
    .map((member) => {
      const other = endOf(member);
      // Drawn in the direction tokens flow where the ends say which way that
      // is: an output port gives, an input port takes, a place does both.
      const [source, target] =
        hub.gives && other.takes
          ? [hub, other]
          : other.gives && hub.takes
            ? [other, hub]
            : [hub, other];
      const id = fusionLinkId(fusion.id, member);
      return {
        id,
        fusionId: fusion.id,
        name,
        sourceId: source.nodeId,
        targetId: target.nodeId,
        sourcePortId: source.portId,
        targetPortId: target.portId,
        selected,
        severity,
        focus: focus.arcFocus(id),
      };
    });
};

export const buildCanvasScene = ({
  net,
  activeSubnetId,
  sdcpn,
  extensions,
  dimensions,
  draggingStateByNodeId,
  isSelected,
  hoveredId,
  focus,
  pinnedVisualizerIds,
}: CanvasSceneInput): CanvasScene => {
  const interaction = (id: string) => ({
    selected: isSelected(id),
    hovered: hoveredId === id,
    focus: focus.nodeFocus(id),
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
      visualizerPinned: pinnedVisualizerIds.has(place.id),
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
      .map((place) => ({
        id: place.id,
        name: place.name,
        direction: subnet
          ? effectivePortDirection(subnet, place)
          : ("inout" as const),
      }));
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
        focus: focus.arcFocus(id),
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
        focus: focus.arcFocus(id),
      });
    }
  }

  const fusions: CanvasFusionLink[] = extensions.subnets
    ? net.fusions.flatMap((fusion) =>
        buildFusionLinks({
          fusion,
          net,
          sdcpn,
          activeSubnetId,
          selected: isSelected(fusion.id),
          focus,
        }),
      )
    : [];

  return { nodes, arcs, fusions, dimensions, focusActive: focus.active };
};
