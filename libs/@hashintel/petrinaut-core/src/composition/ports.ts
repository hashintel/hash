/**
 * Port directions: what a component promises about each of its ports, and
 * what its arcs say it does. A port is a place, so a fusion can always join
 * it with any other place of the right token type; its direction is a
 * contract the checks hold the component and the composition to.
 */

import { arcMatchesEndpoint, placeArcEndpoint } from "../arc-endpoints";
import { findFusionWithMember } from "./fusions";

import type {
  ArcEndpoint,
  ID,
  Place,
  PortDirection,
  Subnet,
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
type PortNet = Pick<Subnet, "transitions" | "fusions">;

/**
 * How a net's own transitions touch one of its ports, on the port itself or
 * on what the net fuses with it: fused, they are one place.
 */
export const portUsage = (net: PortNet, placeId: ID): PortUsage => {
  const port = placeArcEndpoint(placeId);
  const members = findFusionWithMember(net, port)?.members ?? [port];
  const usages = members.map((member) =>
    endpointUsage(net.transitions, member),
  );
  return {
    consumed: usages.some(({ consumed }) => consumed),
    produced: usages.some(({ produced }) => produced),
    touched: usages.some(({ touched }) => touched),
  };
};

/**
 * The direction a net's arcs give one of its ports: `in` when only consumed
 * from, `out` when only produced into, `inout` when both. A port no arc
 * moves a token through is `inout`: it is whatever the outside makes of it.
 */
export const inferPortDirection = (
  net: PortNet,
  placeId: ID,
): PortDirection => {
  const { consumed, produced } = portUsage(net, placeId);
  if (consumed && !produced) {
    return "in";
  }
  if (produced && !consumed) {
    return "out";
  }
  return "inout";
};

/** The direction a port declares, else the one its net's arcs give it. */
export const effectivePortDirection = (
  net: PortNet,
  place: Pick<Place, "id" | "portDirection">,
): PortDirection => place.portDirection ?? inferPortDirection(net, place.id);

/** Whether the subnet's arcs keep the port's declared direction. */
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
