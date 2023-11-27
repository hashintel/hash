import {
  Attachment,
  Comment,
  CustomView,
  Cycle,
  Document,
  Issue,
  IssueLabel,
  LinearDocument,
  Organization,
  Project,
  ProjectMilestone,
  Team,
  User,
} from "@linear/sdk";
import { PartialEntity } from "@local/hash-backend-utils/temporal-workflow-types";
import {
  blockProtocolPropertyTypes,
  linearEntityTypes,
  linearPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { EntityPropertiesObject } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

const toIsoString = (date: string | Date): string => {
  if (typeof date === "string") {
    return date;
  }
  return date.toISOString();
};

export const userToEntity = (user: User): PartialEntity => {
  return {
    entityTypeId: linearEntityTypes.user.entityTypeId,
    properties: {
      [extractBaseUrl(linearPropertyTypes.active.propertyTypeId)]: user.active,
      [extractBaseUrl(linearPropertyTypes.admin.propertyTypeId)]: user.admin,
      [extractBaseUrl(linearPropertyTypes.archivedAt.propertyTypeId)]:
        user.archivedAt ? toIsoString(user.archivedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.avatarUrl.propertyTypeId)]:
        user.avatarUrl,
      [extractBaseUrl(linearPropertyTypes.createdAt.propertyTypeId)]:
        toIsoString(user.createdAt),
      [extractBaseUrl(linearPropertyTypes.createdIssueCount.propertyTypeId)]:
        user.createdIssueCount,
      [extractBaseUrl(blockProtocolPropertyTypes.description.propertyTypeId)]:
        user.description,
      [extractBaseUrl(linearPropertyTypes.disableReason.propertyTypeId)]:
        user.disableReason,
      [extractBaseUrl(linearPropertyTypes.displayName.propertyTypeId)]:
        user.displayName,

      [extractBaseUrl(systemPropertyTypes.email.propertyTypeId)]: user.email,
      [extractBaseUrl(linearPropertyTypes.fullName.propertyTypeId)]: user.name,
      [extractBaseUrl(linearPropertyTypes.guest.propertyTypeId)]: user.guest,
      [extractBaseUrl(linearPropertyTypes.id.propertyTypeId)]: user.id,
      [extractBaseUrl(linearPropertyTypes.inviteHash.propertyTypeId)]:
        user.inviteHash,
      [extractBaseUrl(linearPropertyTypes.isMe.propertyTypeId)]: user.isMe,
      [extractBaseUrl(linearPropertyTypes.lastSeen.propertyTypeId)]:
        user.lastSeen ? toIsoString(user.lastSeen) : undefined,
      [extractBaseUrl(linearPropertyTypes.statusEmoji.propertyTypeId)]:
        user.statusEmoji,
      [extractBaseUrl(linearPropertyTypes.statusLabel.propertyTypeId)]:
        user.statusLabel,
      [extractBaseUrl(linearPropertyTypes.statusUntilAt.propertyTypeId)]:
        user.statusUntilAt ? toIsoString(user.statusUntilAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.timezone.propertyTypeId)]:
        user.timezone,
      [extractBaseUrl(linearPropertyTypes.updatedAt.propertyTypeId)]:
        toIsoString(user.updatedAt),
      [extractBaseUrl(linearPropertyTypes.profileUrl.propertyTypeId)]: user.url,
    },
  };
};

export const organizationToEntity = (
  organization: Organization,
): PartialEntity => {
  return {
    entityTypeId: linearEntityTypes.organization.entityTypeId,
    properties: {
      [extractBaseUrl(linearPropertyTypes.allowedAuthService.propertyTypeId)]:
        organization.allowedAuthServices,
      [extractBaseUrl(linearPropertyTypes.archivedAt.propertyTypeId)]:
        organization.archivedAt
          ? toIsoString(organization.archivedAt)
          : undefined,
      [extractBaseUrl(linearPropertyTypes.createdAt.propertyTypeId)]:
        toIsoString(organization.createdAt),
      [extractBaseUrl(linearPropertyTypes.createdIssueCount.propertyTypeId)]:
        organization.createdIssueCount,
      [extractBaseUrl(linearPropertyTypes.deletionRequestedAt.propertyTypeId)]:
        organization.deletionRequestedAt
          ? toIsoString(organization.deletionRequestedAt)
          : undefined,
      [extractBaseUrl(linearPropertyTypes.gitBranchFormat.propertyTypeId)]:
        organization.gitBranchFormat,
      [extractBaseUrl(
        linearPropertyTypes.gitLinkbackMessagesEnabled.propertyTypeId,
      )]: organization.gitLinkbackMessagesEnabled,
      [extractBaseUrl(
        linearPropertyTypes.gitPublicLinkbackMessagesEnabled.propertyTypeId,
      )]: organization.gitPublicLinkbackMessagesEnabled,
      [extractBaseUrl(linearPropertyTypes.id.propertyTypeId)]: organization.id,
      [extractBaseUrl(linearPropertyTypes.logoUrl.propertyTypeId)]:
        organization.logoUrl,
      [extractBaseUrl(linearPropertyTypes.name.propertyTypeId)]:
        organization.name,
      [extractBaseUrl(linearPropertyTypes.periodUploadVolume.propertyTypeId)]:
        organization.periodUploadVolume,
      [extractBaseUrl(linearPropertyTypes.previousUrlKeys.propertyTypeId)]:
        organization.previousUrlKeys,
      [extractBaseUrl(
        linearPropertyTypes.projectUpdateRemindersHour.propertyTypeId,
      )]: organization.projectUpdateRemindersHour,
      [extractBaseUrl(linearPropertyTypes.roadmapEnabled.propertyTypeId)]:
        organization.roadmapEnabled,
      [extractBaseUrl(linearPropertyTypes.samlEnabled.propertyTypeId)]:
        organization.samlEnabled,
      [extractBaseUrl(linearPropertyTypes.scimEnabled.propertyTypeId)]:
        organization.scimEnabled,
      [extractBaseUrl(linearPropertyTypes.trialEndsAt.propertyTypeId)]:
        organization.trialEndsAt
          ? toIsoString(organization.trialEndsAt)
          : undefined,
      [extractBaseUrl(linearPropertyTypes.updatedAt.propertyTypeId)]:
        toIsoString(organization.updatedAt),
      [extractBaseUrl(linearPropertyTypes.urlKey.propertyTypeId)]:
        organization.urlKey,
      [extractBaseUrl(linearPropertyTypes.userCount.propertyTypeId)]:
        organization.userCount,
    },
  };
};

export const teamToEntity = (_team: Team): object => {
  return {};
};

// @todo avoid having to repeat each field in two places – have some object that translates between
//   Linear keys and HASH properties
export const entityPropertiesToIssueUpdate = (
  properties: EntityPropertiesObject,
): LinearDocument.IssueUpdateInput => {
  return {
    description: properties[
      extractBaseUrl(blockProtocolPropertyTypes.description.propertyTypeId)
    ] as string,
    dueDate:
      properties[extractBaseUrl(linearPropertyTypes.dueDate.propertyTypeId)],
    estimate: properties[
      extractBaseUrl(linearPropertyTypes.estimate.propertyTypeId)
    ] as number,
    priority: properties[
      extractBaseUrl(linearPropertyTypes.priority.propertyTypeId)
    ] as number,
    title: properties[
      extractBaseUrl(linearPropertyTypes.title.propertyTypeId)
    ] as string,
  };
};

export const issueToEntity = (issue: Issue): PartialEntity => {
  return {
    entityTypeId: linearEntityTypes.issue.entityTypeId,
    properties: {
      [extractBaseUrl(linearPropertyTypes.archivedAt.propertyTypeId)]:
        issue.archivedAt ? toIsoString(issue.archivedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.autoArchivedAt.propertyTypeId)]:
        issue.autoArchivedAt ? toIsoString(issue.autoArchivedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.autoClosedAt.propertyTypeId)]:
        issue.autoClosedAt ? toIsoString(issue.autoClosedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.branchName.propertyTypeId)]:
        issue.branchName,
      [extractBaseUrl(linearPropertyTypes.canceledAt.propertyTypeId)]:
        issue.canceledAt ? toIsoString(issue.canceledAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.completedAt.propertyTypeId)]:
        issue.completedAt ? toIsoString(issue.completedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.createdAt.propertyTypeId)]:
        toIsoString(issue.createdAt),
      [extractBaseUrl(linearPropertyTypes.customerTicketCount.propertyTypeId)]:
        issue.customerTicketCount,
      [extractBaseUrl(linearPropertyTypes.markdownDescription.propertyTypeId)]:
        issue.description,
      [extractBaseUrl(linearPropertyTypes.dueDate.propertyTypeId)]:
        issue.dueDate as string,
      [extractBaseUrl(linearPropertyTypes.estimate.propertyTypeId)]:
        issue.estimate,
      [extractBaseUrl(linearPropertyTypes.id.propertyTypeId)]: issue.id,
      [extractBaseUrl(linearPropertyTypes.identifier.propertyTypeId)]:
        issue.identifier,
      [extractBaseUrl(linearPropertyTypes.issueNumber.propertyTypeId)]:
        issue.number,
      [extractBaseUrl(linearPropertyTypes.previousIdentifier.propertyTypeId)]:
        issue.previousIdentifiers,
      [extractBaseUrl(linearPropertyTypes.priority.propertyTypeId)]:
        issue.priority,
      [extractBaseUrl(linearPropertyTypes.priorityLabel.propertyTypeId)]:
        issue.priorityLabel,
      [extractBaseUrl(linearPropertyTypes.snoozedUntilAt.propertyTypeId)]:
        issue.snoozedUntilAt ? toIsoString(issue.snoozedUntilAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.sortOrder.propertyTypeId)]:
        issue.sortOrder,
      [extractBaseUrl(linearPropertyTypes.startedAt.propertyTypeId)]:
        issue.startedAt ? toIsoString(issue.startedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.startedTriageAt.propertyTypeId)]:
        issue.startedTriageAt ? toIsoString(issue.startedTriageAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.subIssueSortOrder.propertyTypeId)]:
        issue.subIssueSortOrder,
      [extractBaseUrl(linearPropertyTypes.title.propertyTypeId)]: issue.title,
      [extractBaseUrl(linearPropertyTypes.trashed.propertyTypeId)]:
        issue.trashed,
      [extractBaseUrl(linearPropertyTypes.triagedAt.propertyTypeId)]:
        issue.triagedAt ? toIsoString(issue.triagedAt) : undefined,
      [extractBaseUrl(linearPropertyTypes.updatedAt.propertyTypeId)]:
        toIsoString(issue.updatedAt),
      [extractBaseUrl(linearPropertyTypes.issueUrl.propertyTypeId)]: issue.url,
    },
  };
};

export const issueLabelToEntity = (_issueLabel: IssueLabel): object => {
  return {};
};

export const cycleToEntity = (_cycle: Cycle): object => {
  return {};
};

export const customViewToEntity = (_customView: CustomView): object => {
  return {};
};

export const projectToEntity = (_project: Project): object => {
  return {};
};

export const commentToEntity = (_comment: Comment): object => {
  return {};
};

export const projectMilestoneToEntity = (
  _projectMilestone: ProjectMilestone,
): object => {
  return {};
};

export const documentToEntity = (_document: Document): object => {
  return {};
};

export const attachmentToEntity = (_attachment: Attachment): object => {
  return {};
};
