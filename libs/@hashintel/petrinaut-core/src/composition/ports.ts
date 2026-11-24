/**
 * Port directions: what a component promises about each of its ports, and
 * what its arcs say it does. A port is a place, so a fusion can always join
 * it with any other place of the right token type; its direction is a
 * contract the checks hold the component and the composition to.
 */

import {
  arcMatchesEndpoint,
  getArcEndpoint,
  getArcEndpointKey,
  placeArcEndpoint,
} from "../arc-endpoints";

import type {
  ArcEndpoint,
  Component,
  ID,
  InputArc,
  OutputArc,
  Place,
  PortDirection,
  Transition,
} from "../types/sdcpn";

/** Every direction a port can declare, in the order a picker lists them. */
export const portDirections = [
  "in",
  "out",
  "inout",
] as const satisfies readonly PortDirection[];

/**
 * How a set of transitions touches a place. A read or an inhibitor arc looks
 * at the place without moving a token: it touches the place and neither
 * consumes from it nor produces into it.
 */
export type PortUsage = {
  /** Some transition takes tokens from it. */
  consumed: boolean;
  /** Some transition produces into it. */
  produced: boolean;
  /** Some arc reaches it, of any kind. */
  touched: boolean;
};

/** How `transitions` touch the place `endpoint` names. */
export const endpointUsage = (
  transitions: readonly Transition[],
  endpoint: ArcEndpoint,
): PortUsage => {
  const inputs = transitions.flatMap(({ inputArcs }) =>
    inputArcs.filter((arc) => arcMatchesEndpoint(arc, endpoint)),
  );
  const produced = transitions.some(({ outputArcs }) =>
    outputArcs.some((arc) => arcMatchesEndpoint(arc, endpoint)),
  );
  return {
    consumed: inputs.some(({ type }) => type === "standard"),
    produced,
    touched: produced || inputs.length > 0,
  };
};

/** The part of a net a port's usage is read from. */
export type PortNet = Pick<Component, "transitions" | "fusions">;

const untouched: PortUsage = {
  consumed: false,
  produced: false,
  touched: false,
};

/**
 * How a net's own transitions touch each of its ports, on the port itself or
 * on what the net fuses with it: fused, they are one place. The net's arcs
 * are read once and each fusion once, so a caller with many ports to ask
 * about calls this once and asks the function it returns.
 */
export const portUsages = (net: PortNet): ((placeId: ID) => PortUsage) => {
  const byEndpoint = new Map<string, PortUsage>();
  const record = (
    arc: InputArc | OutputArc,
    flow: Pick<PortUsage, "consumed" | "produced">,
  ) => {
    const key = getArcEndpointKey(getArcEndpoint(arc));
    const known = byEndpoint.get(key) ?? untouched;
    byEndpoint.set(key, {
      consumed: known.consumed || flow.consumed,
      produced: known.produced || flow.produced,
      touched: true,
    });
  };
  for (const { inputArcs, outputArcs } of net.transitions) {
    for (const arc of inputArcs) {
      record(arc, { consumed: arc.type === "standard", produced: false });
    }
    for (const arc of outputArcs) {
      record(arc, { consumed: false, produced: true });
    }
  }
  const usageOf = (endpoint: ArcEndpoint): PortUsage =>
    byEndpoint.get(getArcEndpointKey(endpoint)) ?? untouched;

  // Of two fusions that hold one place, the first gives its usage: the one
  // a search of the net's fusions finds.
  const byFusedPlace = new Map<ID, PortUsage>();
  for (const { members } of net.fusions ?? []) {
    const usages = members.map(usageOf);
    const fused: PortUsage = {
      consumed: usages.some(({ consumed }) => consumed),
      produced: usages.some(({ produced }) => produced),
      touched: usages.some(({ touched }) => touched),
    };
    for (const member of members) {
      if (member.kind === "place" && !byFusedPlace.has(member.placeId)) {
        byFusedPlace.set(member.placeId, fused);
      }
    }
  }
  return (placeId) =>
    byFusedPlace.get(placeId) ?? usageOf(placeArcEndpoint(placeId));
};

/** How a net's own transitions touch one of its ports: see `portUsages`. */
export const portUsage = (net: PortNet, placeId: ID): PortUsage =>
  portUsages(net)(placeId);

/**
 * The direction a usage gives a port: `in` when only consumed from, `out`
 * when only produced into, `inout` when both. A port no arc moves a token
 * through is `inout`: it is whatever the outside makes of it.
 */
const directionOfUsage = ({
  consumed,
  produced,
}: Pick<PortUsage, "consumed" | "produced">): PortDirection => {
  if (consumed && !produced) {
    return "in";
  }
  if (produced && !consumed) {
    return "out";
  }
  return "inout";
};

/** The direction a net's arcs give one of its ports: see `directionOfUsage`. */
export const inferPortDirection = (net: PortNet, placeId: ID): PortDirection =>
  directionOfUsage(portUsage(net, placeId));

/**
 * The direction a port declares, else the one its net's arcs give it. Reads
 * the net's arcs for a port that declares none: a caller with many ports of
 * one net to ask about calls `effectivePortDirections` once.
 */
export const effectivePortDirection = (
  net: PortNet,
  place: Pick<Place, "id" | "portDirection">,
): PortDirection => place.portDirection ?? inferPortDirection(net, place.id);

/**
 * The direction of every port of a net, by the port's id: the one it
 * declares, else the one the net's arcs give it. The arcs are read once, and
 * not at all when every port declares its direction.
 */
export const effectivePortDirections = (
  net: PortNet & Pick<Component, "places">,
): Map<ID, PortDirection> => {
  let usageOf: ((placeId: ID) => PortUsage) | undefined;
  const directions = new Map<ID, PortDirection>();
  for (const place of net.places) {
    if (!place.isPort) {
      continue;
    }
    if (place.portDirection !== undefined) {
      directions.set(place.id, place.portDirection);
      continue;
    }
    usageOf ??= portUsages(net);
    directions.set(place.id, directionOfUsage(usageOf(place.id)));
  }
  return directions;
};

/** Whether the component's arcs keep the port's declared direction. */
export const portUsageMatchesDirection = (
  usage: Pick<PortUsage, "consumed" | "produced">,
  direction: PortDirection,
): boolean =>
  direction === "inout" ||
  (direction === "in" && !usage.produced) ||
  (direction === "out" && !usage.consumed);

export const describePortDirection = (direction: PortDirection): string =>
  direction === "in"
    ? "input"
    : direction === "out"
      ? "output"
      : "input and output";
