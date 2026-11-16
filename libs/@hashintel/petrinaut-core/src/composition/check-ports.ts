/**
 * The check on a net's ports: a port that declares a direction is used that
 * way by its own subnet.
 */

import { arcEndpointsEqual, placeArcEndpoint } from "../arc-endpoints";
import {
  describePortDirection,
  endpointUsage,
  portUsageMatchesDirection,
  type PortUsage,
} from "./ports";

import type { ID, SDCPN, Subnet } from "../types/sdcpn";

/** A port whose subnet uses it against the direction it declares. */
export type PortProblem = {
  subnetId: ID;
  placeId: ID;
  severity: "warning";
  message: string;
};

/**
 * How a subnet's transitions touch one of its ports, on the port itself or
 * on what the subnet fuses with it: fused, they are one place.
 */
const fusedPortUsage = (
  subnet: Pick<Subnet, "transitions" | "fusions">,
  placeId: ID,
): Pick<PortUsage, "consumed" | "produced"> => {
  const port = placeArcEndpoint(placeId);
  const members = subnet.fusions?.find((fusion) =>
    fusion.members.some((member) => arcEndpointsEqual(member, port)),
  )?.members ?? [port];
  const usages = members.map((member) =>
    endpointUsage(subnet.transitions, member),
  );
  return {
    consumed: usages.some(({ consumed }) => consumed),
    produced: usages.some(({ produced }) => produced),
  };
};

/** The ports whose declared direction their subnet's arcs contradict. */
export const checkPorts = (sdcpn: SDCPN): PortProblem[] =>
  (sdcpn.subnets ?? []).flatMap((subnet) =>
    subnet.places.flatMap((place) => {
      if (!place.isPort || place.portDirection === undefined) {
        return [];
      }
      const usage = fusedPortUsage(subnet, place.id);
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
