import { getArcEndpoint, toPetrinautId } from "@hashintel/petrinaut-core";

import type {
  FlowNetFiring,
  FlowNetPlacedToken,
  FlowNetPosition,
} from "./interpret-flow-net.js";
import type { FlowRunReplay } from "./replay-flow-run-events.js";
import type {
  ActualModeMarking,
  ActualModeTransitionFiring,
  ArcEndpoint,
  Color,
  ComponentInstance,
  InputArc,
  OutputArc,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "@hashintel/petrinaut-core";

/*
 * A display-only stand-in until Petrinaut composes nets by place fusion: flattens a compiled flow net into one net
 * with no subnets, so Actual Mode, which keys a marking by place id alone, can show the tokens inside each step's
 * instance of its action's subnet. The compiler, the interpreter and the replay keep working on the net with subnets;
 * only what Petrinaut is given is flat.
 */

export type FlatFlowNet = {
  net: SDCPN;
  /** The flat net's place for a position in the net with subnets. */
  placeId: (position: FlowNetPosition) => string;
  /** The flat net's transition for a firing in the net with subnets. */
  transitionId: (
    firing: Pick<FlowNetFiring, "transitionId" | "componentInstanceId">,
  ) => string;
};

/** The flat id of a place or transition of an instance's subnet. Deterministic, so ids match across calls. */
const flatId = (componentInstanceId: string, innerId: string) =>
  toPetrinautId(`${componentInstanceId}::${innerId}`);

const placeIdOf = (position: FlowNetPosition) =>
  position.kind === "place"
    ? position.placeId
    : flatId(position.componentInstanceId, position.placeId);

const transitionIdOf: FlatFlowNet["transitionId"] = ({
  transitionId,
  componentInstanceId,
}) =>
  componentInstanceId === undefined
    ? transitionId
    : flatId(componentInstanceId, transitionId);

/** An arc pointing at the flat place for its endpoint, as seen from `componentInstanceId` (or the root). */
const flattenArc = <Arc extends InputArc | OutputArc>(
  arc: Arc,
  componentInstanceId: string | undefined,
): Arc => {
  const endpoint: ArcEndpoint = getArcEndpoint(arc);
  const placeId =
    endpoint.kind === "componentPort"
      ? flatId(endpoint.componentInstanceId, endpoint.portPlaceId)
      : componentInstanceId === undefined
        ? endpoint.placeId
        : flatId(componentInstanceId, endpoint.placeId);

  const { placeId: _legacyPlaceId, endpoint: _endpoint, ...rest } = arc;

  return { ...rest, endpoint: { kind: "place", placeId } } as Arc;
};

const boundsOf = (nodes: readonly { x: number; y: number }[]) => {
  const xs = nodes.map(({ x }) => x);
  const ys = nodes.map(({ y }) => y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

/** Space left around a subnet's nodes where its instance's box was. */
const subnetMargin = 160;

/** The root's layout puts the nodes of a layer at the same `x`. */
const layerOf = (x: number) => Math.round(x / 10);

/**
 * Moves the root's nodes apart to make room for each instance's subnet where the instance's box was: each layer with
 * instances widens by its widest subnet, and within it, nodes below an instance move down by its subnet's height.
 * Returns where each root node, and each subnet's centre, goes.
 */
const makeRoomForSubnets = (
  instances: readonly ComponentInstance[],
  sizeOf: (instance: ComponentInstance) => { width: number; height: number },
) => {
  const layerWidths = new Map<number, number>();

  for (const instance of instances) {
    const layer = layerOf(instance.x);

    layerWidths.set(
      layer,
      Math.max(layerWidths.get(layer) ?? 0, sizeOf(instance).width),
    );
  }

  return (node: { x: number; y: number }, ownSize?: { height: number }) => {
    const layer = layerOf(node.x);
    let x = node.x + (layerWidths.get(layer) ?? 0) / 2;
    let y = node.y + (ownSize?.height ?? 0) / 2;

    for (const [otherLayer, width] of layerWidths) {
      if (otherLayer < layer) {
        x += width;
      }
    }

    for (const instance of instances) {
      if (layerOf(instance.x) === layer && instance.y < node.y) {
        y += sizeOf(instance).height;
      }
    }

    return { x, y };
  };
};

/** The step each instance runs for: the one whose `startStep` feeds the instance's ports. */
const stepIdsByInstanceId = (net: SDCPN) => {
  const stepIds = new Map<string, string>();

  for (const transition of net.transitions) {
    const stepId = transition.metadata?.stepId;

    if (
      transition.metadata?.role !== "startStep" ||
      typeof stepId !== "string"
    ) {
      continue;
    }

    for (const arc of transition.outputArcs) {
      const endpoint = getArcEndpoint(arc);

      if (endpoint.kind === "componentPort") {
        stepIds.set(endpoint.componentInstanceId, stepId);
      }
    }
  }

  return stepIds;
};

/**
 * Flattens a compiled flow net: every place and transition of each instance's subnet is copied into the root, under
 * an id derived from the instance's and its own, so a token or firing inside an instance has a place or transition of
 * its own. Arcs to an instance's ports point at its copies of them.
 *
 * Inner nodes sit where their instance's box was, at their offset in the subnet's own layout, and the root's nodes
 * move apart to make room for them.
 *
 * @throws if a subnet has instances of its own: the compiler only nests one level.
 */
export const flattenFlowNet = (net: SDCPN): FlatFlowNet => {
  const subnetsById = new Map(
    (net.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  const instances = net.componentInstances ?? [];
  const stepIds = stepIdsByInstanceId(net);

  for (const subnet of subnetsById.values()) {
    if ((subnet.componentInstances ?? []).length > 0) {
      throw new Error(
        `Subnet "${subnet.name}" has instances of its own, which flattening a flow net doesn't handle`,
      );
    }
  }

  const subnetOf = (instance: ComponentInstance): Subnet => {
    const subnet = subnetsById.get(instance.subnetId);

    if (!subnet) {
      throw new Error(
        `Instance "${instance.name}" is of an unknown subnet "${instance.subnetId}"`,
      );
    }

    return subnet;
  };

  const subnetBounds = new Map(
    [...subnetsById.values()].map((subnet) => [
      subnet.id,
      boundsOf([...subnet.places, ...subnet.transitions]),
    ]),
  );
  const boundsOfInstance = (instance: ComponentInstance) =>
    subnetBounds.get(subnetOf(instance).id)!;
  const moveRootNode = makeRoomForSubnets(instances, (instance) => {
    const { minX, maxX, minY, maxY } = boundsOfInstance(instance);

    return {
      width: maxX - minX + subnetMargin,
      height: maxY - minY + subnetMargin,
    };
  });

  const places: Place[] = net.places.map((place) => ({
    ...place,
    ...moveRootNode(place),
  }));
  const transitions: Transition[] = net.transitions.map((transition) => ({
    ...transition,
    ...moveRootNode(transition),
    inputArcs: transition.inputArcs.map((arc) => flattenArc(arc, undefined)),
    outputArcs: transition.outputArcs.map((arc) => flattenArc(arc, undefined)),
  }));
  const types = new Map<string, Color>(
    net.types.map((type) => [type.id, type]),
  );

  for (const instance of instances) {
    const subnet = subnetOf(instance);
    const bounds = boundsOfInstance(instance);
    const stepId = stepIds.get(instance.id);
    /* The step's id is shorter than the instance's name, which adds its action's, and is enough to tell steps apart. */
    const prefix = stepId ?? instance.name;

    /* Centre the subnet's nodes on where the instance's box goes. */
    const centre = moveRootNode(instance, {
      height: bounds.maxY - bounds.minY + subnetMargin,
    });
    const position = ({ x, y }: { x: number; y: number }) => ({
      x: centre.x + x - (bounds.minX + bounds.maxX) / 2,
      y: centre.y + y - (bounds.minY + bounds.maxY) / 2,
    });

    for (const place of subnet.places) {
      places.push({
        ...place,
        ...position(place),
        id: flatId(instance.id, place.id),
        name: `${prefix} · ${place.name}`,
        isPort: false,
      });
    }

    for (const transition of subnet.transitions) {
      transitions.push({
        ...transition,
        ...position(transition),
        id: flatId(instance.id, transition.id),
        name: `${prefix} · ${transition.name}`,
        metadata: {
          ...transition.metadata,
          ...(stepId !== undefined && transition.metadata?.stepId === undefined
            ? { stepId }
            : {}),
        },
        inputArcs: transition.inputArcs.map((arc) =>
          flattenArc(arc, instance.id),
        ),
        outputArcs: transition.outputArcs.map((arc) =>
          flattenArc(arc, instance.id),
        ),
      });
    }

    for (const type of subnet.types) {
      if (!types.has(type.id)) {
        types.set(type.id, type);
      }
    }
  }

  return {
    net: {
      ...net,
      places,
      transitions,
      types: [...types.values()],
      subnets: [],
      componentInstances: [],
    },
    placeId: placeIdOf,
    transitionId: transitionIdOf,
  };
};

const countAtFlatPlaces = (
  placedTokens: readonly FlowNetPlacedToken[],
  flat: FlatFlowNet,
) => {
  const counts: Record<string, number> = {};

  for (const { position } of placedTokens) {
    const placeId = flat.placeId(position);

    counts[placeId] = (counts[placeId] ?? 0) + 1;
  }

  return counts;
};

/**
 * A replay as an execution for Petrinaut's Actual Mode on the flattened net, with the tokens and firings inside
 * instances too. Tokens are counted, without colours: the items of a `forEach` share one instance, so a place shows
 * how many tokens it has, not which item each is for.
 */
export const toFlatNetActualModeExecution = (
  replay: FlowRunReplay,
  flat: FlatFlowNet,
): {
  initialState: ActualModeMarking;
  transitionFirings: ActualModeTransitionFiring[];
} => ({
  initialState: countAtFlatPlaces(replay.initialMarking, flat),
  transitionFirings: replay.firings.map((firing) => ({
    transitionId: flat.transitionId(firing),
    input: countAtFlatPlaces(firing.consumed, flat),
    output: countAtFlatPlaces(firing.produced, flat),
    ts: firing.occurredAt,
  })),
});
