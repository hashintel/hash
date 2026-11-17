/**
 * How a fusion is drawn and extended: one link from its hub, the anchor place
 * or the first member, to each other member, and what joining two places by
 * a drag does to the net's fusions. Shared by the scene that draws the links,
 * the focus index that looks them up and the interactions that make them.
 */

import {
  checkFusion,
  findFusionWithMember,
  fusionAnchor,
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

/** What the canvas shows of a fusion as a whole, beside its name. */
export type FusionStatus = {
  /** The worst of the fusion's problems, or `null` when it has none. */
  severity: ProblemSeverity | null;
};

const severitiesWorstFirst: ProblemSeverity[] = ["error", "warning", "info"];

/** The worst problem of every fusion of `net`, by fusion id. */
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
          severity:
            severitiesWorstFirst.find((severity) =>
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
  /**
   * One end belongs to a fusion: `member` joins it. When `member` is in a
   * fusion too, the mutation merges that one in; the first end's fusion is
   * the one kept.
   */
  | { kind: "join"; fusionId: string; member: FusionMember }
  | { kind: "new"; members: [FusionMember, FusionMember] };

export const planFusion = (
  net: Pick<ActiveNetDefinition, "fusions">,
  first: FusionMember,
  second: FusionMember,
): FusionPlan => {
  const firstFusion = findFusionWithMember(net, first);
  const secondFusion = findFusionWithMember(net, second);
  const anchorOf = (member: FusionMember, fusion: Fusion | undefined) =>
    member.kind === "place" ? member : fusion && fusionAnchor(fusion);
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
