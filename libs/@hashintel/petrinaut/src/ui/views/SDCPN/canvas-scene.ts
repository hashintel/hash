/**
 * The renderer-agnostic picture of the net: the nodes and arcs any canvas
 * renderer draws, carrying the interaction state that changes how they look.
 * Time-varying simulation state (token counts, firings) stays out of it, so a
 * playback frame never rebuilds the scene; renderers read it from the
 * execution frame source.
 */

import {
  effectivePortDirection,
  resolveImplementation,
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
  getComponentInstanceHeight,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

import { fusionLinks, type FusionStatus } from "./fusion-links";
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
  /** The direction of the port this place is, `null` for a plain place. */
  port: PortDirection | null;
  dynamicsEnabled: boolean;
  hasColorType: boolean;
  /** Whether the place defines custom visualizer code. */
  hasVisualizer: boolean;
  /** Whether its visualizer stays open without a hover. */
  visualizerKeptOpen: boolean;
  visualizerActive: boolean;
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
  /** Display colour of the port's token type, when it has one. */
  typeColor: string | undefined;
};

/**
 * What an instance runs: its component, or the implementation bound to the
 * interface it points at, `null` while nothing is bound.
 */
export type CanvasInstanceBinding =
  | { kind: "component" }
  | { kind: "interface"; implementationName: string | null };

/** A component with more ports than this starts folded, its ports behind a toggle. */
export const COMPONENT_INSTANCE_FOLD_THRESHOLD = 4;

export type CanvasComponentInstanceNode = CanvasNodeBase & {
  kind: "componentInstance";
  /** The subnet the instance points at: its component or its interface. */
  subnetName: string;
  binding: CanvasInstanceBinding;
  ports: CanvasPort[];
  /** Whether the card can fold its ports away: it has more than the threshold. */
  foldable: boolean;
  /** Whether the ports show in rows, or fold into the card's base height. */
  expanded: boolean;
  /**
   * How far the card's centre sits below the position the document holds for
   * it. A foldable card unfolds downward, its header staying where it is, so
   * unfolding moves its centre by half of what it grew.
   */
  anchorOffset: number;
};

export type CanvasNode =
  | CanvasPlaceNode
  | CanvasTransitionNode
  | CanvasComponentInstanceNode;

export type CanvasNodeKind = CanvasNode["kind"];

/** The two nodes a line on the canvas joins. */
export type CanvasLinkEnds = {
  sourceId: string;
  targetId: string;
  /** The port place at either end when that end is a component instance. */
  sourcePortId: string | null;
  targetPortId: string | null;
};

export type CanvasArc = CanvasLinkEnds & {
  id: string;
  kind: InputArcType;
  weight: number;
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
 * links; every link selects and hovers the fusion as a whole. Its two ends
 * are ordered left to right on the canvas, so the link runs between the
 * sides that face each other: a fusion link has no direction.
 */
export type CanvasFusionLink = CanvasLinkEnds & {
  /** Unique per link: the fusion id and the member the link leads to. */
  id: string;
  fusionId: string;
  /** The fused place's name, shown on the link when selected or hovered. */
  name: string;
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
  /** The whole document, for subnet lookups. */
  sdcpn: SDCPN;
  /** The name and the worst problem of each of the net's fusions. */
  fusionStatuses: ReadonlyMap<string, FusionStatus>;
  extensions: PetrinautExtensionSettings;
  dimensions: RenderNodeDimensions;
  draggingStateByNodeId: DraggingStateByNodeId;
  isSelected: (id: string) => boolean;
  /** The node under the pointer, once the hover has settled. */
  hoveredId: string | null;
  focus: CanvasFocus;
  /** Places whose state visualizer stays open without a hover. */
  keptOpenVisualizerIds: ReadonlySet<string>;
  activeVisualizerIds?: ReadonlySet<string>;
  /** The foldable instances whose ports are unfolded. */
  expandedInstanceIds: ReadonlySet<string>;
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

const portIdOf = (endpoint: ArcEndpoint): string | null =>
  endpoint.kind === "componentPort" ? endpoint.portPlaceId : null;

const buildFusionLinks = ({
  fusion,
  status,
  nodes,
  selected,
  focus,
}: {
  fusion: ActiveNetDefinition["fusions"][number];
  status: FusionStatus | undefined;
  nodes: readonly CanvasNode[];
  selected: boolean;
  focus: CanvasFocus;
}): CanvasFusionLink[] => {
  const centreX = (member: FusionMember): number => {
    const nodeId = getArcEndpointNodeId(member);
    return nodes.find((node) => node.id === nodeId)?.position.x ?? 0;
  };

  return fusionLinks(fusion).map(({ id, hub, member }) => {
    // The left end's right-hand handle to the right end's left-hand handle,
    // so the curve runs between the nodes rather than back through one.
    const [source, target] =
      centreX(member) < centreX(hub) ? [member, hub] : [hub, member];
    return {
      id,
      fusionId: fusion.id,
      name: status?.name ?? fusion.id,
      sourceId: getArcEndpointNodeId(source),
      targetId: getArcEndpointNodeId(target),
      sourcePortId: portIdOf(source),
      targetPortId: portIdOf(target),
      selected,
      severity: status?.severity ?? null,
      focus: focus.arcFocus(id),
    };
  });
};

export const buildCanvasScene = ({
  net,
  sdcpn,
  fusionStatuses,
  extensions,
  dimensions,
  draggingStateByNodeId,
  isSelected,
  hoveredId,
  focus,
  keptOpenVisualizerIds,
  activeVisualizerIds,
  expandedInstanceIds,
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
      port: place.isPort ? effectivePortDirection(net, place) : null,
      dynamicsEnabled:
        extensions.colors && extensions.dynamics && place.dynamicsEnabled,
      hasColorType: (placeType?.elements.length ?? 0) > 0,
      hasVisualizer: place.visualizerCode !== undefined,
      visualizerKeptOpen: keptOpenVisualizerIds.has(place.id),
      visualizerActive: activeVisualizerIds?.has(place.id) ?? false,
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
        typeColor:
          extensions.colors && place.colorId
            ? subnet?.types.find((type) => type.id === place.colorId)
                ?.displayColor
            : undefined,
      }));
    const resolved = resolveImplementation(sdcpn, instance);
    const binding: CanvasInstanceBinding =
      resolved === null || resolved.kind === "component"
        ? { kind: "component" }
        : {
            kind: "interface",
            implementationName:
              resolved.kind === "bound" ? resolved.implementation.name : null,
          };
    const foldable = ports.length > COMPONENT_INSTANCE_FOLD_THRESHOLD;
    const expanded = !foldable || expandedInstanceIds.has(instance.id);
    const foldedHeight = dimensions.componentInstance.height;
    const height = expanded
      ? getComponentInstanceHeight(dimensions, ports.length)
      : foldedHeight;
    const anchorOffset = foldable ? (height - foldedHeight) / 2 : 0;
    const { position, dragging } = positionOf(instance, draggingStateByNodeId);
    nodes.push({
      kind: "componentInstance",
      id: instance.id,
      label: instance.name,
      width: dimensions.componentInstance.width,
      height,
      position: { x: position.x, y: position.y + anchorOffset },
      dragging,
      anchorOffset,
      ...interaction(instance.id),
      subnetName: subnet?.name ?? "Unknown subnet",
      binding,
      ports,
      foldable,
      expanded,
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
        sourcePortId: portIdOf(endpoint),
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
        targetPortId: portIdOf(endpoint),
        transitionId: transition.id,
        color: arcStrokeColor(endpointColor(endpoint)),
        selected: isSelected(id),
        focus: focus.arcFocus(id),
      });
    }
  }

  const fusions: CanvasFusionLink[] = net.fusions.flatMap((fusion) =>
    buildFusionLinks({
      fusion,
      status: fusionStatuses.get(fusion.id),
      nodes,
      selected: isSelected(fusion.id),
      focus,
    }),
  );

  return { nodes, arcs, fusions, dimensions, focusActive: focus.active };
};
