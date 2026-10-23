/**
 * How a fusion is drawn: one link from its hub, the anchor place or the first
 * member, to each other member. The link ids are shared by the scene that
 * builds them and the focus index that looks them up.
 */

import { fusionAnchor, fusionMemberKey } from "@hashintel/petrinaut-core";

import type { Fusion, FusionMember } from "@hashintel/petrinaut-core";

/** The link id for one member of a fusion; the fusion itself is selected by its own id. */
export const fusionLinkId = (fusionId: string, member: FusionMember): string =>
  `fusion:${fusionId}:${fusionMemberKey(member)}`;

/** The member the other members link to. */
export const fusionHub = (fusion: Fusion): FusionMember | undefined =>
  fusionAnchor(fusion) ?? fusion.members[0];
