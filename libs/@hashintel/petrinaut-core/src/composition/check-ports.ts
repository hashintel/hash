/**
 * The check on a net's ports: a port that declares a direction is used that
 * way by its own subnet.
 */

import {
  describePortDirection,
  portUsage,
  portUsageMatchesDirection,
} from "./ports";

import type { ID, SDCPN } from "../types/sdcpn";

/** A port whose subnet uses it against the direction it declares. */
export type PortProblem = {
  subnetId: ID;
  placeId: ID;
  severity: "warning";
  message: string;
};

/** The ports whose declared direction their subnet's arcs contradict. */
export const checkPorts = (sdcpn: SDCPN): PortProblem[] =>
  (sdcpn.subnets ?? []).flatMap((subnet) =>
    subnet.places.flatMap((place) => {
      if (!place.isPort || place.portDirection === undefined) {
        return [];
      }
      const usage = portUsage(subnet, place.id);
      if (portUsageMatchesDirection(usage, place.portDirection)) {
        return [];
      }
      const against =
        place.portDirection === "in" ? "produces into" : "consumes from";
      return [
        {
          subnetId: subnet.id,
          placeId: place.id,
          severity: "warning" as const,
          message: `Port ${place.name} of ${subnet.name} is declared ${describePortDirection(place.portDirection)}, but a transition of ${subnet.name} ${against} it.`,
        },
      ];
    }),
  );
