/**
 * The check on a net's ports: a port that declares a direction is used that
 * way by its own component.
 */

import {
  describePortDirection,
  portUsageMatchesDirection,
  portUsages,
} from "./ports";

import type { ID, SDCPN } from "../types/sdcpn";

/** A port whose component uses it against the direction it declares. */
export type PortProblem = {
  kind: "port";
  componentId: ID;
  placeId: ID;
  severity: "warning";
  message: string;
};

/** The ports whose declared direction their component's arcs contradict. */
export const checkPorts = (sdcpn: SDCPN): PortProblem[] =>
  (sdcpn.components ?? []).flatMap((component) => {
    const usageOf = portUsages(component);
    return component.places.flatMap((place) => {
      if (!place.isPort || place.portDirection === undefined) {
        return [];
      }
      const usage = usageOf(place.id);
      if (portUsageMatchesDirection(usage, place.portDirection)) {
        return [];
      }
      const against =
        place.portDirection === "in" ? "produces into" : "consumes from";
      return [
        {
          kind: "port" as const,
          componentId: component.id,
          placeId: place.id,
          severity: "warning" as const,
          message: `Port ${place.name} of ${component.name} is declared ${describePortDirection(place.portDirection)}, but a transition of ${component.name} ${against} it.`,
        },
      ];
    });
  });
