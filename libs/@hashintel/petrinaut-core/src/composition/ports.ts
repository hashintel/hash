/**
 * Port directions: what a component promises about each of its ports, and
 * what its arcs say it does. A port is a place, so a fusion can always join
 * it with any other place of the right token type; its direction is a
 * contract the checks hold the component and the composition to.
 */

import { getArcEndpoint } from "../arc-endpoints";

import type { Place, PortDirection, Subnet } from "../types/sdcpn";

/** How the subnet's own transitions touch a place. */
export type PortUsage = {
  /** Some transition of the subnet consumes, reads or is inhibited by it. */
  consumed: boolean;
  /** Some transition of the subnet produces into it. */
  produced: boolean;
};

export const portUsage = (
  subnet: Pick<Subnet, "transitions">,
  placeId: string,
): PortUsage => {
  let consumed = false;
  let produced = false;
  for (const transition of subnet.transitions) {
    for (const arc of transition.inputArcs) {
      const endpoint = getArcEndpoint(arc);
      if (endpoint.kind === "place" && endpoint.placeId === placeId) {
        consumed = true;
      }
    }
    for (const arc of transition.outputArcs) {
      const endpoint = getArcEndpoint(arc);
      if (endpoint.kind === "place" && endpoint.placeId === placeId) {
        produced = true;
      }
    }
  }
  return { consumed, produced };
};

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
  usage: PortUsage,
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
