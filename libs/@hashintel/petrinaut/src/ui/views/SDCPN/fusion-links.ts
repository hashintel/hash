/**
 * How a fusion is drawn and edited: one link from its hub, the anchor place
 * or the first member, to each other member, and what a drag does to the
 * net's fusions, whether it joins two places or moves the end of a link.
 * Shared by the scene that draws the links, the focus index that looks them
 * up and the interactions that make them.
 */

import {
  arcEndpointsEqual,
  checkFusion,
  findFusionWithMember,
  fusionAnchor,
  fusionDisplayName,
  fusionHub,
  getArcEndpointKey,
} from "@hashintel/petrinaut-core";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type {
  Fusion,
  FusionMember,
  ProblemSeverity,
  SDCPN,
} from "@hashintel/petrinaut-core";

/** One link of a fusion: from its hub to another of its members. */
export type FusionLink = {
  /** Unique per link; the fusion itself is selected by its own id. */
  id: string;
  hub: FusionMember;
  member: FusionMember;
};

export const fusionLinks = (fusion: Fusion): FusionLink[] => {
  const hub = fusionHub(fusion);
  return hub === undefined
    ? []
    : fusion.members
        .filter((member) => member !== hub)
        .map((member) => ({
          id: `fusion:${fusion.id}:${getArcEndpointKey(member)}`,
          hub,
          member,
        }));
};

/** What the canvas shows of a fusion as a whole. */
export type FusionStatus = {
  /** The fused place's name. */
  name: string;
  /** The worst of the fusion's problems, or `null` when it has none. */
  severity: ProblemSeverity | null;
};

const severities: ProblemSeverity[] = ["error", "warning", "info"];

/** The name and the worst problem of every fusion of `net`, by fusion id. */
export const fusionStatuses = (
  sdcpn: SDCPN,
  net: ActiveNetDefinition,
  activeSubnetId: string | null,
): Map<string, FusionStatus> =>
  new Map(
    net.fusions.map((fusion) => {
      const problems = checkFusion(sdcpn, net, fusion, activeSubnetId);
      return [
        fusion.id,
        {
          name: fusionDisplayName(sdcpn, net, fusion),
          severity:
            severities.find((severity) =>
              problems.some((problem) => problem.severity === severity),
            ) ?? null,
        },
      ];
    }),
  );

/** What joining two places by a drag does to the net's fusions. */
export type FusionPlan =
  /** The fused place would be two places of this net, and it holds one at most. */
  | { kind: "refused" }
  /** One end belongs to a fusion: `member` joins it, bringing its own along. */
  | { kind: "join"; fusionId: string; member: FusionMember }
  | { kind: "new"; members: [FusionMember, FusionMember] };

/**
 * The place of the net a member is fused with or is: the member itself, else
 * the anchor of the fusion that holds it.
 */
const anchorOf = (member: FusionMember, fusion: Fusion | undefined) =>
  member.kind === "place" ? member : fusion && fusionAnchor(fusion);

export const planFusion = (
  net: Pick<ActiveNetDefinition, "fusions">,
  first: FusionMember,
  second: FusionMember,
): FusionPlan => {
  const firstFusion = findFusionWithMember(net, first);
  const secondFusion = findFusionWithMember(net, second);
  const firstAnchor = anchorOf(first, firstFusion);
  const secondAnchor = anchorOf(second, secondFusion);
  if (
    firstAnchor &&
    secondAnchor &&
    firstAnchor.placeId !== secondAnchor.placeId
  ) {
    return { kind: "refused" };
  }
  if (firstFusion) {
    return { kind: "join", fusionId: firstFusion.id, member: second };
  }
  if (secondFusion) {
    return { kind: "join", fusionId: secondFusion.id, member: first };
  }
  return { kind: "new", members: [first, second] };
};

/** What picking up a member's end of a fusion and dropping it elsewhere does. */
export type RewirePlan =
  /** Dropped on a member of the same fusion: there is nothing to move. */
  | { kind: "none" }
  /** The fused place would be two places of this net, and it holds one at most. */
  | { kind: "refused" }
  /** Dropped on the empty canvas: the member leaves the fusion. */
  | { kind: "detach"; fusionId: string; member: FusionMember }
  /** The fusion moves from the member to where it was dropped. */
  | {
      kind: "replace";
      fusionId: string;
      member: FusionMember;
      replacement: FusionMember;
    };

export const planRewire = (
  net: Pick<ActiveNetDefinition, "fusions">,
  fusion: Fusion,
  member: FusionMember,
  /** The place or port the end was dropped on, `null` for the empty canvas. */
  replacement: FusionMember | null,
): RewirePlan => {
  if (replacement === null) {
    return { kind: "detach", fusionId: fusion.id, member };
  }
  if (fusion.members.some((held) => arcEndpointsEqual(held, replacement))) {
    return { kind: "none" };
  }
  const staying = fusion.members.filter(
    (held) => !arcEndpointsEqual(held, member),
  );
  return fusionAnchor({ members: staying }) &&
    anchorOf(replacement, findFusionWithMember(net, replacement))
    ? { kind: "refused" }
    : { kind: "replace", fusionId: fusion.id, member, replacement };
};
