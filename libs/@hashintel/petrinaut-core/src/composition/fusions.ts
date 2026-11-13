/**
 * @layerRoot core.composition
 * @role Place fusion: how a net's places and its component instances' ports become one place, the checks on a fusion, and how flattening merges them
 *
 * A fusion names places the way an arc endpoint does, so the endpoint helpers
 * apply to its members. This module resolves members to the places they name
 * and finds the fusion a member belongs to; `check-fusions.ts` verifies a
 * fusion's members agree, and `apply-fusions.ts` merges them once the net is
 * flattened for simulation.
 */

import { arcEndpointsEqual, getArcEndpointKey } from "../arc-endpoints";

import type {
  ComponentInstance,
  Fusion,
  FusionMember,
  ID,
  Place,
  PlaceArcEndpoint,
  SDCPN,
  Subnet,
} from "../types/sdcpn";

/** The net a fusion belongs to: the document's root or one of its subnets. */
export type FusionNet = Pick<
  SDCPN,
  "places" | "componentInstances" | "fusions"
>;

/** The fusion of `net` that holds `member`, if any. */
export const findFusionWithMember = (
  net: FusionNet,
  member: FusionMember,
): Fusion | undefined =>
  (net.fusions ?? []).find((fusion) =>
    fusion.members.some((candidate) => arcEndpointsEqual(candidate, member)),
  );

/** The member that is a place of the fusion's own net, if any. */
export const fusionAnchor = (
  fusion: Pick<Fusion, "members">,
): PlaceArcEndpoint | undefined =>
  fusion.members.find((member) => member.kind === "place");

/**
 * The member that stands for the fused place: the anchor, else the first
 * member. The fused place shows its name, and the canvas links the other
 * members to it.
 */
export const fusionHub = (
  fusion: Pick<Fusion, "members">,
): FusionMember | undefined => fusionAnchor(fusion) ?? fusion.members[0];

/**
 * What is wrong with a member list on its own: the positions of the members
 * listed a second time, and whether it holds more than one place of the net.
 */
export const fusionMemberIssues = (
  members: readonly FusionMember[],
): { duplicates: number[]; multipleAnchors: boolean } => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  const anchors = new Set<ID>();
  for (const [index, member] of members.entries()) {
    const key = getArcEndpointKey(member);
    if (seen.has(key)) {
      duplicates.push(index);
    }
    seen.add(key);
    if (member.kind === "place") {
      anchors.add(member.placeId);
    }
  }
  return { duplicates, multipleAnchors: anchors.size > 1 };
};

/** What a member names, once resolved against the document. */
export type ResolvedFusionMember =
  | { kind: "place"; place: Place }
  | {
      kind: "port";
      instance: ComponentInstance;
      subnet: Subnet;
      /** The port place inside `subnet`. */
      place: Place;
    };

/**
 * Resolves a member to the place it names: a place of `net`, or a port place
 * inside the subnet one of `net`'s instances instantiates. `null` when the
 * place, the instance, its subnet or the port does not exist, or when the
 * place is not marked as a port.
 */
export const resolveFusionMember = (
  sdcpn: Pick<SDCPN, "subnets">,
  net: FusionNet,
  member: FusionMember,
): ResolvedFusionMember | null => {
  if (member.kind === "place") {
    const place = net.places.find(({ id }) => id === member.placeId);
    return place ? { kind: "place", place } : null;
  }
  const instance = (net.componentInstances ?? []).find(
    ({ id }) => id === member.componentInstanceId,
  );
  const subnet = instance
    ? (sdcpn.subnets ?? []).find(({ id }) => id === instance.subnetId)
    : undefined;
  const place = subnet?.places.find(({ id }) => id === member.portPlaceId);
  return instance && subnet && place && place.isPort
    ? { kind: "port", instance, subnet, place }
    : null;
};

/** `Place` for a place of the net, `Instance.Port` for an instance port. */
export const describeFusionMember = (
  sdcpn: Pick<SDCPN, "subnets">,
  net: FusionNet,
  member: FusionMember,
): string => {
  const resolved = resolveFusionMember(sdcpn, net, member);
  if (resolved === null) {
    return member.kind === "place"
      ? `place ${member.placeId}`
      : `${member.componentInstanceId}.${member.portPlaceId}`;
  }
  return resolved.kind === "place"
    ? resolved.place.name
    : `${resolved.instance.name}.${resolved.place.name}`;
};

/**
 * The name the fused place shows: the fusion's own name, else its anchor's,
 * else the first member's.
 */
export const fusionDisplayName = (
  sdcpn: Pick<SDCPN, "subnets">,
  net: FusionNet,
  fusion: Fusion,
): string => {
  if (fusion.name !== undefined) {
    return fusion.name;
  }
  const hub = fusionHub(fusion);
  return hub ? describeFusionMember(sdcpn, net, hub) : fusion.id;
};
