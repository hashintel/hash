import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * Entity types the user may have entities of that should be excluded from view in the UI
 */
export const hiddenEntityTypeIds: VersionedUrl[] = [
  systemEntityTypes.block.entityTypeId,
  systemEntityTypes.comment.entityTypeId,
  systemEntityTypes.commentNotification.entityTypeId,
  systemEntityTypes.graphChangeNotification.entityTypeId,
  systemEntityTypes.mentionNotification.entityTypeId,
  systemEntityTypes.linearIntegration.entityTypeId,
  systemEntityTypes.facebookAccount.entityTypeId,
  systemEntityTypes.instagramAccount.entityTypeId,
  systemEntityTypes.githubAccount.entityTypeId,
  systemEntityTypes.twitterAccount.entityTypeId,
  systemEntityTypes.tiktokAccount.entityTypeId,
  systemEntityTypes.machine.entityTypeId,
  systemEntityTypes.user.entityTypeId,
];
