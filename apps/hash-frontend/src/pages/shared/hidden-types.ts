import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  googleEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { typedKeys } from "@local/advanced-types/typed-entries";

/**
 * Entity types the user may have entities of that should be excluded from view in the UI
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

/**
 * Types which shouldn't be shown in type selectors etc,
 * because they either are forbidden from being created by users,
 * or because they require special handling and will be unusable if manually created.
 */
export const nonAssignableTypes = Object.values(systemEntityTypes).map(
  (type) => type.entityTypeId,
);
