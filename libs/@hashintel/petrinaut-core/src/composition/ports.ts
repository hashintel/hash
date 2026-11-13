/**
 * Port directions: what a component promises about each of its ports, and
 * what its arcs say it does. A port is a place, so a fusion can always join
 * it with any other place of the right token type; its direction is a
 * contract the checks hold the component and the composition to.
 */

import { arcMatchesEndpoint, placeArcEndpoint } from "../arc-endpoints";

import type {
  ArcEndpoint,
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

/** How a set of transitions touches a place. */
export type PortUsage = {
  /** Some transition consumes from it, reads it or is inhibited by it. */
  consumed: boolean;
  /** Some transition takes tokens from it, which a read or an inhibitor arc does not. */
  drained: boolean;
  /** Some transition produces into it. */
  produced: boolean;
};

/** How `transitions` touch the place `endpoint` names. */
export const endpointUsage = (
  transitions: readonly Transition[],
  endpoint: ArcEndpoint,
): PortUsage => {
  const inputs = transitions.flatMap(({ inputArcs }) =>
    inputArcs.filter((arc) => arcMatchesEndpoint(arc, endpoint)),
  );
  return {
    consumed: inputs.length > 0,
    drained: inputs.some(({ type }) => type === "standard"),
    produced: transitions.some(({ outputArcs }) =>
      outputArcs.some((arc) => arcMatchesEndpoint(arc, endpoint)),
    ),
  };
};

/** How the subnet's own transitions touch one of its places. */
export const portUsage = (
  subnet: Pick<Subnet, "transitions">,
  placeId: string,
): PortUsage => endpointUsage(subnet.transitions, placeArcEndpoint(placeId));

/**
 * The direction the subnet's arcs give a port: `in` when only consumed, `out`
 * when only produced into, `inout` when both. A port no transition touches
 * is `inout`: it is whatever the outside makes of it.
 */
export const inferPortDirection = (
  subnet: Pick<Subnet, "transitions">,
  placeId: string,
): PortDirection => {
  const { consumed, produced } = portUsage(subnet, placeId);
  if (consumed && !produced) {
    return "in";
  }
  if (produced && !consumed) {
    return "out";
  }
  return "inout";
};

/** The direction a port declares, else the one its subnet's arcs give it. */
export const effectivePortDirection = (
  subnet: Pick<Subnet, "transitions">,
  place: Pick<Place, "id" | "portDirection">,
): PortDirection => place.portDirection ?? inferPortDirection(subnet, place.id);

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
