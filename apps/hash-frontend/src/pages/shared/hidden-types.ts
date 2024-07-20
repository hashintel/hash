import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  googleEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * Entity types the user may have entities of that should be excluded from view in the UI.
 */
export const hiddenEntityTypeIds: VersionedUrl[] = [
  googleEntityTypes.account.entityTypeId,
  systemEntityTypes.block.entityTypeId,
  systemEntityTypes.browserPluginSettings.entityTypeId,
  systemEntityTypes.comment.entityTypeId,
  systemEntityTypes.commentNotification.entityTypeId,
  systemEntityTypes.facebookAccount.entityTypeId,
  systemEntityTypes.flowRun.entityTypeId,
  systemEntityTypes.flowDefinition.entityTypeId,
  systemEntityTypes.githubAccount.entityTypeId,
  systemEntityTypes.graphChangeNotification.entityTypeId,
  systemEntityTypes.instagramAccount.entityTypeId,
  systemEntityTypes.linearIntegration.entityTypeId,
  systemEntityTypes.linkedinAccount.entityTypeId,
  systemEntityTypes.machine.entityTypeId,
  systemEntityTypes.mentionNotification.entityTypeId,
  systemEntityTypes.profileBio.entityTypeId,
  systemEntityTypes.prospectiveUser.entityTypeId,
  systemEntityTypes.quickNote.entityTypeId,
  systemEntityTypes.text.entityTypeId,
  systemEntityTypes.tiktokAccount.entityTypeId,
  systemEntityTypes.twitterAccount.entityTypeId,
  systemEntityTypes.usageRecord.entityTypeId,
  systemEntityTypes.userSecret.entityTypeId,
];
