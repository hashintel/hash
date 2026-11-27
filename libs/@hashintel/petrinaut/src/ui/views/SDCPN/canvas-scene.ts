/**
 * The renderer-agnostic picture of the net: the nodes and arcs any canvas
 * renderer draws, carrying the interaction state that changes how they look.
 * Time-varying simulation state (token counts, firings) stays out of it, so a
 * playback frame never rebuilds the scene; renderers read it from the
 * execution frame source.
 */

import {
  componentKey,
  effectivePortDirections,
  resolveImplementation,
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
  getComponentInstanceHeight,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  indexById,
  indexDocument,
} from "@hashintel/petrinaut-core";

import { fusionLinks } from "./fusion-links";
import { arcStrokeColor } from "./styles/type-colors";

import type { ActiveNetDefinition } from "../../../react/document/active-net-context";
import type {
  CanvasArcFocus,
  CanvasFocus,
  CanvasNodeFocus,
} from "./canvas-focus";
import type {
  ArcEndpoint,
  ComponentReference,
  FusionMember,
  InputArcType,
  PetrinautExtensionSettings,
  PortDirection,
  ProblemSeverity,
  ResolvedLibraries,
  RenderNodeDimensions,
  SDCPN,
  Component,
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
  /** Where this node stands relative to the focused item. */
  focus: CanvasNodeFocus;
};

export type CanvasPlaceNode = CanvasNodeBase & {
  kind: "place";
  /** The direction of the port this place is, `null` for a plain place. */
  portDirection: PortDirection | null;
  dynamicsEnabled: boolean;
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
 * interface it points at, `null` while nothing is bound. `unresolved` when
 * its component cannot be read: one the document no longer has, or one of an
 * import that failed.
 */
export type CanvasInstanceBinding =
  | { kind: "component" }
  | { kind: "interface"; implementationName: string | null }
  | { kind: "unresolved" };

/** A component with more ports than this starts folded, its ports behind a toggle. */
const foldThreshold = 4;

/**
 * How tall the panel is that draws a component's visualizer on the cards of
 * its instances, under their ports.
 */
export const instanceVisualizerHeight = 124;

export type CanvasComponentInstanceNode = CanvasNodeBase & {
  kind: "componentInstance";
  /** The name of what the instance points at: a component or an interface. */
  componentName: string;
  binding: CanvasInstanceBinding;
  /** The component's icon as SVG markup, or `null` for the default glyph. */
  icon: string | null;
  /** The component's colour, or `null` for the default. */
  color: string | null;
  ports: CanvasPort[];
  /** Whether the card can fold its ports away: it has more than the threshold. */
  foldable: boolean;
  /** Whether the ports show in rows, or fold into the card's base height. */
  unfolded: boolean;
  /**
   * How far the card's centre sits below the position the document holds for
   * it. A foldable card unfolds downward, its header staying where it is, so
   * unfolding moves its centre by half of what it grew. The panel of a
   * visualizer hangs under the card the same way.
   */
  anchorOffset: number;
  /**
   * The height of the panel under the ports that draws the visualizer of
   * the component the instance runs. 0 when that component has none.
   */
  visualizerHeight: number;
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

export type CanvasLinkEndName = "source" | "target";

/** One end of a line: its node, and the port when the node is a component instance. */
export type CanvasLinkEnd = { nodeId: string; portId: string | null };

export const linkEnd = (
  link: CanvasLinkEnds,
  name: CanvasLinkEndName,
): CanvasLinkEnd =>
  name === "source"
    ? { nodeId: link.sourceId, portId: link.sourcePortId }
    : { nodeId: link.targetId, portId: link.targetPortId };

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
  /** The fusion's name, shown on the link when selected or hovered. */
  name: string;
  selected: boolean;
  /** The worst of the fusion's problems, or `null` when it has none. */
  severity: ProblemSeverity | null;
  focus: CanvasArcFocus;
  /**
   * The ends that can be picked up and dropped elsewhere. The hub's end
   * stays put while other links meet there: only the member's end says
   * which member the link stands for.
   */
  movableEnds: CanvasLinkEndName | "both";
};

export type CanvasScene = {
  nodes: CanvasNode[];
  arcs: CanvasArc[];
  fusions: CanvasFusionLink[];
  /**
   * Whether anything is focused. Drives the muting of everything outside the
   * neighbourhood from the pane, so a hover leaves the other items untouched.
   */
  focusActive: boolean;
};

/** Where each dragged node is shown until its drag ends and commits. */
export type CanvasDragPreview = ReadonlyMap<string, CanvasPoint>;

export type CanvasSceneInput = {
  net: ActiveNetDefinition;
  /** The whole document, for component lookups. */
  sdcpn: SDCPN;
  /** The libraries the document's imports resolved to. */
  libraries: ResolvedLibraries;
  /** The worst problem of each of the net's fusions. */
  fusionSeverities: ReadonlyMap<string, ProblemSeverity | null>;
  /** How each transition of the net gives its rate. */
  lambdaTypes: ReadonlyMap<string, CanvasTransitionNode["lambdaType"]>;
  extensions: PetrinautExtensionSettings;
  dimensions: RenderNodeDimensions;
  dragPreview: CanvasDragPreview;
  selectedIds: ReadonlySet<string>;
  focus: CanvasFocus;
  /** Places whose state visualizer stays open without a hover. */
  keptOpenVisualizerIds: ReadonlySet<string>;
  activeVisualizerIds?: ReadonlySet<string>;
  /** The foldable instances whose ports are unfolded. */
  unfoldedInstanceIds: ReadonlySet<string>;
  /** Whether the cards of instances draw their component's visualizer. */
  instanceVisualizers: boolean;
};

const positionOf = (
  item: { id: string; x: number; y: number },
  dragPreview: CanvasDragPreview,
): { position: CanvasPoint; dragging: boolean } => {
  const previewed = dragPreview.get(item.id);
  return previewed
    ? { position: previewed, dragging: true }
    : { position: { x: item.x, y: item.y }, dragging: false };
};

const portIdOf = (endpoint: ArcEndpoint): string | null =>
  endpoint.kind === "componentPort" ? endpoint.portPlaceId : null;

const buildFusionLinks = ({
  fusion,
  severity,
  nodes,
  selected,
  focus,
}: {
  fusion: ActiveNetDefinition["fusions"][number];
  severity: ProblemSeverity | null;
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
    const memberEnd = centreX(member) < centreX(hub) ? "source" : "target";
    const [source, target] =
      memberEnd === "source" ? [member, hub] : [hub, member];
    return {
      id,
      fusionId: fusion.id,
      name: fusion.name,
      sourceId: getArcEndpointNodeId(source),
      targetId: getArcEndpointNodeId(target),
      sourcePortId: portIdOf(source),
      targetPortId: portIdOf(target),
      selected,
      severity,
      focus: focus.arcFocus(id),
      movableEnds: fusion.members.length > 2 ? memberEnd : "both",
    };
  });
};

/**
 * How each transition of `net` gives its rate, or "none" where the net's
 * extensions leave it none. It depends on the net alone, and Core reads
 * every place of the net for each transition: work it out once per net, not
 * once per scene.
 */
export const transitionLambdaTypes = (
  net: ActiveNetDefinition,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  libraries: ResolvedLibraries,
): CanvasSceneInput["lambdaTypes"] =>
  new Map(
    net.transitions.map((transition) => {
      const availability = getTransitionLogicAvailability(
        transition,
        sdcpn,
        extensions,
        net,
        libraries,
      );
      return [
        transition.id,
        availability.lambda
          ? getEffectiveTransitionLambdaType(transition, availability)
          : "none",
      ];
    }),
  );

export const buildCanvasScene = ({
  net,
  sdcpn,
  libraries,
  fusionSeverities,
  lambdaTypes,
  extensions,
  dimensions,
  dragPreview,
  selectedIds,
  focus,
  keptOpenVisualizerIds,
  activeVisualizerIds,
  unfoldedInstanceIds,
  instanceVisualizers,
}: CanvasSceneInput): CanvasScene => {
  const interaction = (id: string) => ({
    selected: selectedIds.has(id),
    focus: focus.nodeFocus(id),
  });

  /** The token type `colorId` names among those of the net that holds it. */
  const typeIn = (
    scope: Pick<ActiveNetDefinition, "types">,
    colorId: string | null,
  ) =>
    extensions.colors && colorId
      ? scope.types.find((type) => type.id === colorId)
      : undefined;

  const nodes: CanvasNode[] = [];

  // The net's arcs are read once for the directions of all its own ports.
  const ownPortDirections = effectivePortDirections(net);

  for (const place of net.places) {
    const placeType = typeIn(net, place.colorId);
    nodes.push({
      kind: "place",
      id: place.id,
      label: place.name,
      ...dimensions.place,
      ...positionOf(place, dragPreview),
      ...interaction(place.id),
      portDirection: place.isPort
        ? (ownPortDirections.get(place.id) ?? "inout")
        : null,
      dynamicsEnabled:
        extensions.colors && extensions.dynamics && place.dynamicsEnabled,
      hasVisualizer: place.visualizerCode !== undefined,
      visualizerKeptOpen: keptOpenVisualizerIds.has(place.id),
      visualizerActive: activeVisualizerIds?.has(place.id) ?? false,
      typeColor: placeType?.displayColor,
    });
  }

  for (const transition of net.transitions) {
    nodes.push({
      kind: "transition",
      id: transition.id,
      label: transition.name,
      ...dimensions.transition,
      ...positionOf(transition, dragPreview),
      ...interaction(transition.id),
      lambdaType: lambdaTypes.get(transition.id) ?? "none",
    });
  }

  // What a component's ports show is worked out once, however many instances
  // of it the net holds: its arcs are read once for their directions, and its
  // token types are looked up by id for their colours.
  const portsByComponent = new Map<string, readonly CanvasPort[]>();
  const portsOf = (
    reference: ComponentReference,
    component: Component,
  ): readonly CanvasPort[] => {
    const key = componentKey(reference);
    const known = portsByComponent.get(key);
    if (known) {
      return known;
    }
    const directions = effectivePortDirections(component);
    const types = indexById(component.types);
    const ports = component.places
      .filter((place) => place.isPort)
      .map((place) => ({
        id: place.id,
        name: place.name,
        direction: directions.get(place.id) ?? "inout",
        typeColor:
          extensions.colors && place.colorId
            ? types.get(place.colorId)?.displayColor
            : undefined,
      }));
    portsByComponent.set(key, ports);
    return ports;
  };

  // The document's components and defaults, read once for every instance.
  const index =
    net.componentInstances.length > 0 ? indexDocument(sdcpn) : undefined;

  // The ports of each instance by id, for the arcs that end at one.
  const portsByInstanceId = new Map<string, ReadonlyMap<string, CanvasPort>>();

  for (const instance of net.componentInstances) {
    const resolved = resolveImplementation(sdcpn, instance, libraries, index);
    // The component the instance points at: the ports it shows are that one's,
    // whichever implementation runs behind them.
    const component =
      resolved?.kind === "component" ? resolved.component : resolved?.interface;
    const ports: CanvasPort[] = component
      ? portsOf(instance.component, component).map((port) => ({ ...port }))
      : [];
    portsByInstanceId.set(instance.id, indexById(ports));
    const running =
      resolved?.kind === "bound" ? resolved.implementation : undefined;
    const binding: CanvasInstanceBinding =
      resolved === null
        ? { kind: "unresolved" }
        : resolved.kind === "component"
          ? { kind: "component" }
          : { kind: "interface", implementationName: running?.name ?? null };
    const foldable = ports.length > foldThreshold;
    const unfolded = !foldable || unfoldedInstanceIds.has(instance.id);
    const foldedHeight = dimensions.componentInstance.height;
    const portsHeight = unfolded
      ? getComponentInstanceHeight(dimensions, ports.length)
      : foldedHeight;
    // The picture is of what runs: an implementation's, where one is bound.
    const visualized =
      resolved?.kind === "component" ? resolved.component : running;
    const visualizerHeight =
      instanceVisualizers &&
      extensions.colors &&
      visualized?.visualizerCode !== undefined
        ? instanceVisualizerHeight
        : 0;
    const height = portsHeight + visualizerHeight;
    // The card grows downward from its header, for its ports and its picture.
    const anchorOffset =
      (foldable ? (portsHeight - foldedHeight) / 2 : 0) + visualizerHeight / 2;
    const { position, dragging } = positionOf(instance, dragPreview);
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
      // A component of an import that cannot be read goes by its id there.
      componentName:
        component?.name ??
        (instance.component.from === undefined
          ? "Unknown component"
          : instance.component.id),
      binding,
      // The card wears what runs: an implementation's icon and colour come
      // before those of the interface it stands in for.
      icon: running?.iconSvg ?? component?.iconSvg ?? null,
      color: running?.displayColor ?? component?.displayColor ?? null,
      ports,
      foldable,
      unfolded,
      visualizerHeight,
    });
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  /** The colour of the token type the place at an arc's end holds. */
  const endpointColor = (endpoint: ArcEndpoint): string | undefined => {
    const node = nodesById.get(getArcEndpointNodeId(endpoint));
    if (endpoint.kind === "place") {
      return node?.kind === "place" ? node.typeColor : undefined;
    }
    return node?.kind === "componentInstance"
      ? portsByInstanceId.get(node.id)?.get(endpoint.portPlaceId)?.typeColor
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
        selected: selectedIds.has(id),
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
        selected: selectedIds.has(id),
        focus: focus.arcFocus(id),
      });
    }
  }

  const fusions: CanvasFusionLink[] = net.fusions.flatMap((fusion) =>
    buildFusionLinks({
      fusion,
      severity: fusionSeverities.get(fusion.id) ?? null,
      nodes,
      selected: selectedIds.has(fusion.id),
      focus,
    }),
  );

  return { nodes, arcs, fusions, focusActive: focus.active };
};
