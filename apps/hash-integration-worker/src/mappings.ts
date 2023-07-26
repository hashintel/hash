import {
  Attachment,
  Comment,
  CustomView,
  Cycle,
  Document,
  Issue,
  IssueLabel,
  Organization,
  Project,
  ProjectMilestone,
  Team,
  User,
} from "@linear/sdk";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

export const userToEntity = (user: User): object => {
  return {
    [extractBaseUrl(linearTypes.propertyType.active.propertyTypeId)]:
      user.active,
    [extractBaseUrl(linearTypes.propertyType.admin.propertyTypeId)]: user.admin,
    [extractBaseUrl(linearTypes.propertyType.archivedAt.propertyTypeId)]:
      user.archivedAt,
    [extractBaseUrl(linearTypes.propertyType.avatarUrl.propertyTypeId)]:
      user.avatarUrl,
    [extractBaseUrl(linearTypes.propertyType.createdAt.propertyTypeId)]:
      user.createdAt,
    [extractBaseUrl(linearTypes.propertyType.createdIssueCount.propertyTypeId)]:
      user.createdIssueCount,
    [extractBaseUrl(linearTypes.propertyType.description.propertyTypeId)]:
      user.description,
    [extractBaseUrl(linearTypes.propertyType.disableReason.propertyTypeId)]:
      user.disableReason,
    [extractBaseUrl(linearTypes.propertyType.displayName.propertyTypeId)]:
      user.displayName,
    [extractBaseUrl(linearTypes.propertyType.email.propertyTypeId)]: user.email,
    [extractBaseUrl(linearTypes.propertyType.guest.propertyTypeId)]: user.guest,
    [extractBaseUrl(linearTypes.propertyType.id.propertyTypeId)]: user.id,
    [extractBaseUrl(linearTypes.propertyType.isMe.propertyTypeId)]: user.isMe,
    [extractBaseUrl(linearTypes.propertyType.lastSeen.propertyTypeId)]:
      user.lastSeen,
    [extractBaseUrl(linearTypes.propertyType.statusEmoji.propertyTypeId)]:
      user.statusEmoji,
    [extractBaseUrl(linearTypes.propertyType.statusLabel.propertyTypeId)]:
      user.statusLabel,
    [extractBaseUrl(linearTypes.propertyType.statusUntilAt.propertyTypeId)]:
      user.statusUntilAt,
    [extractBaseUrl(linearTypes.propertyType.timezone.propertyTypeId)]:
      user.timezone,
    [extractBaseUrl(linearTypes.propertyType.updatedAt.propertyTypeId)]:
      user.updatedAt,
    [extractBaseUrl(linearTypes.propertyType.url.propertyTypeId)]: user.url,
  };
};

export const organizationToEntity = (organization: Organization): object => {
  return {
    [extractBaseUrl(
      linearTypes.propertyType.allowedAuthService.propertyTypeId,
    )]: organization.allowedAuthServices,
    [extractBaseUrl(linearTypes.propertyType.archivedAt.propertyTypeId)]:
      organization.archivedAt,
    [extractBaseUrl(linearTypes.propertyType.createdAt.propertyTypeId)]:
      organization.createdAt,
    [extractBaseUrl(linearTypes.propertyType.createdIssueCount.propertyTypeId)]:
      organization.createdIssueCount,
    [extractBaseUrl(
      linearTypes.propertyType.deletionRequestedAt.propertyTypeId,
    )]: organization.deletionRequestedAt,
    [extractBaseUrl(linearTypes.propertyType.gitBranchFormat.propertyTypeId)]:
      organization.gitBranchFormat,
    [extractBaseUrl(
      linearTypes.propertyType.gitLinkbackMessagesEnabled.propertyTypeId,
    )]: organization.gitLinkbackMessagesEnabled,
    [extractBaseUrl(
      linearTypes.propertyType.gitPublicLinkbackMessagesEnabled.propertyTypeId,
    )]: organization.gitPublicLinkbackMessagesEnabled,
    [extractBaseUrl(linearTypes.propertyType.id.propertyTypeId)]:
      organization.id,
    [extractBaseUrl(linearTypes.propertyType.logoUrl.propertyTypeId)]:
      organization.logoUrl,
    [extractBaseUrl(linearTypes.propertyType.name.propertyTypeId)]:
      organization.name,
    [extractBaseUrl(
      linearTypes.propertyType.periodUploadVolume.propertyTypeId,
    )]: organization.periodUploadVolume,
    [extractBaseUrl(
      linearTypes.propertyType.previousIdentifier.propertyTypeId,
    )]: organization.previousUrlKeys,
    [extractBaseUrl(
      linearTypes.propertyType.projectUpdateRemindersHour.propertyTypeId,
    )]: organization.projectUpdateRemindersHour,
    [extractBaseUrl(linearTypes.propertyType.roadmapEnabled.propertyTypeId)]:
      organization.roadmapEnabled,
    [extractBaseUrl(linearTypes.propertyType.samlEnabled.propertyTypeId)]:
      organization.samlEnabled,
    [extractBaseUrl(linearTypes.propertyType.scimEnabled.propertyTypeId)]:
      organization.scimEnabled,
    [extractBaseUrl(linearTypes.propertyType.trialEndsAt.propertyTypeId)]:
      organization.trialEndsAt,
    [extractBaseUrl(linearTypes.propertyType.updatedAt.propertyTypeId)]:
      organization.updatedAt,
    [extractBaseUrl(linearTypes.propertyType.urlKey.propertyTypeId)]:
      organization.urlKey,
    [extractBaseUrl(linearTypes.propertyType.userCount.propertyTypeId)]:
      organization.userCount,
  };
};

export const teamToEntity = (_team: Team): object => {
  return {};
};

export const issueToEntity = (issue: Issue): object => {
  return {
    [extractBaseUrl(linearTypes.propertyType.archivedAt.propertyTypeId)]:
      issue.archivedAt,
    [extractBaseUrl(linearTypes.propertyType.autoArchivedAt.propertyTypeId)]:
      issue.autoArchivedAt,
    [extractBaseUrl(linearTypes.propertyType.autoClosedAt.propertyTypeId)]:
      issue.autoClosedAt,
    [extractBaseUrl(linearTypes.propertyType.branchName.propertyTypeId)]:
      issue.branchName,
    [extractBaseUrl(linearTypes.propertyType.canceledAt.propertyTypeId)]:
      issue.canceledAt,
    [extractBaseUrl(linearTypes.propertyType.completedAt.propertyTypeId)]:
      issue.completedAt,
    [extractBaseUrl(linearTypes.propertyType.createdAt.propertyTypeId)]:
      issue.createdAt,
    [extractBaseUrl(
      linearTypes.propertyType.customerTicketCount.propertyTypeId,
    )]: issue.customerTicketCount,
    [extractBaseUrl(
      linearTypes.propertyType.markdownDescription.propertyTypeId,
    )]: issue.description,
    [extractBaseUrl(linearTypes.propertyType.dueDate.propertyTypeId)]:
      issue.dueDate as string,
    [extractBaseUrl(linearTypes.propertyType.estimate.propertyTypeId)]:
      issue.estimate,
    [extractBaseUrl(linearTypes.propertyType.id.propertyTypeId)]: issue.id,
    [extractBaseUrl(linearTypes.propertyType.identifier.propertyTypeId)]:
      issue.identifier,
    [extractBaseUrl(linearTypes.propertyType.number.propertyTypeId)]:
      issue.number,
    [extractBaseUrl(
      linearTypes.propertyType.previousIdentifier.propertyTypeId,
    )]: issue.previousIdentifiers,
    [extractBaseUrl(linearTypes.propertyType.priority.propertyTypeId)]:
      issue.priority,
    [extractBaseUrl(linearTypes.propertyType.priorityLabel.propertyTypeId)]:
      issue.priorityLabel,
    [extractBaseUrl(linearTypes.propertyType.snoozedUntilAt.propertyTypeId)]:
      issue.snoozedUntilAt,
    [extractBaseUrl(linearTypes.propertyType.sortOrder.propertyTypeId)]:
      issue.sortOrder,
    [extractBaseUrl(linearTypes.propertyType.startedAt.propertyTypeId)]:
      issue.startedAt,
    [extractBaseUrl(linearTypes.propertyType.startedTriageAt.propertyTypeId)]:
      issue.startedTriageAt,
    [extractBaseUrl(linearTypes.propertyType.subIssueSortOrder.propertyTypeId)]:
      issue.subIssueSortOrder,
    [extractBaseUrl(linearTypes.propertyType.title.propertyTypeId)]:
      issue.title,
    [extractBaseUrl(linearTypes.propertyType.trashed.propertyTypeId)]:
      issue.trashed,
    [extractBaseUrl(linearTypes.propertyType.triagedAt.propertyTypeId)]:
      issue.triagedAt,
    [extractBaseUrl(linearTypes.propertyType.updatedAt.propertyTypeId)]:
      issue.updatedAt,
    [extractBaseUrl(linearTypes.propertyType.url.propertyTypeId)]: issue.url,
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
