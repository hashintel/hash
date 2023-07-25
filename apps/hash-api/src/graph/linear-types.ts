import { Logger } from "@local/hash-backend-utils/logger";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { logger } from "../logger";
import { ImpureGraphContext } from "./index";
import { entityTypeInitializer, propertyTypeInitializer } from "./util";

// eslint-disable-next-line import/no-mutable-exports
export let LINEAR_TYPES: {
  propertyType: {
    // Generic
    id: PropertyTypeWithMetadata;
    archivedAt: PropertyTypeWithMetadata;
    createdAt: PropertyTypeWithMetadata;
    updatedAt: PropertyTypeWithMetadata;
    // Generic (for HASH)
    createdIssueCount: PropertyTypeWithMetadata;
    name: PropertyTypeWithMetadata;
    url: PropertyTypeWithMetadata;
    // User
    active: PropertyTypeWithMetadata;
    admin: PropertyTypeWithMetadata;
    avatarUrl: PropertyTypeWithMetadata;
    description: PropertyTypeWithMetadata;
    disableReason: PropertyTypeWithMetadata;
    displayName: PropertyTypeWithMetadata;
    email: PropertyTypeWithMetadata;
    guest: PropertyTypeWithMetadata;
    inviteHash: PropertyTypeWithMetadata;
    isMe: PropertyTypeWithMetadata;
    lastSeen: PropertyTypeWithMetadata;
    statusEmoji: PropertyTypeWithMetadata;
    statusLabel: PropertyTypeWithMetadata;
    statusUntilAt: PropertyTypeWithMetadata;
    timezone: PropertyTypeWithMetadata;
    // Organization
    allowedAuthService: PropertyTypeWithMetadata;
    deletionRequestedAt: PropertyTypeWithMetadata;
    gitBranchFormat: PropertyTypeWithMetadata;
    gitLinkbackMessagesEnabled: PropertyTypeWithMetadata;
    gitPublicLinkbackMessagesEnabled: PropertyTypeWithMetadata;
    logoUrl: PropertyTypeWithMetadata;
    periodUploadVolume: PropertyTypeWithMetadata;
    previousUrlKey: PropertyTypeWithMetadata;
    projectUpdateRemindersDay: PropertyTypeWithMetadata;
    projectUpdateRemindersHour: PropertyTypeWithMetadata;
    projectUpdatesReminderFrequency: PropertyTypeWithMetadata;
    releaseChannel: PropertyTypeWithMetadata;
    roadmapEnabled: PropertyTypeWithMetadata;
    samlEnabled: PropertyTypeWithMetadata;
    scimEnabled: PropertyTypeWithMetadata;
    trialEndsAt: PropertyTypeWithMetadata;
    urlKey: PropertyTypeWithMetadata;
    userCount: PropertyTypeWithMetadata;
    // Issue
    autoArchivedAt: PropertyTypeWithMetadata;
    autoClosedAt: PropertyTypeWithMetadata;
    branchName: PropertyTypeWithMetadata;
    canceledAt: PropertyTypeWithMetadata;
    completedAt: PropertyTypeWithMetadata;
    customerTicketCount: PropertyTypeWithMetadata;
    markdownDescription: PropertyTypeWithMetadata;
    dueDate: PropertyTypeWithMetadata;
    estimate: PropertyTypeWithMetadata;
    identifier: PropertyTypeWithMetadata;
    number: PropertyTypeWithMetadata;
    previousIdentifier: PropertyTypeWithMetadata;
    priority: PropertyTypeWithMetadata;
    priorityLabel: PropertyTypeWithMetadata;
    snoozedUntilAt: PropertyTypeWithMetadata;
    sortOrder: PropertyTypeWithMetadata;
    startedAt: PropertyTypeWithMetadata;
    startedTriageAt: PropertyTypeWithMetadata;
    subIssueSortOrder: PropertyTypeWithMetadata;
    title: PropertyTypeWithMetadata;
    trashed: PropertyTypeWithMetadata;
    triagedAt: PropertyTypeWithMetadata;
  };
  entityType: {
    issue: EntityTypeWithMetadata;
    user: EntityTypeWithMetadata;
    organization: EntityTypeWithMetadata;
  };
  linkEntityType: {
    // Generic (for HASH)
    label: EntityTypeWithMetadata;
    team: EntityTypeWithMetadata;
    // User
    assignedIssue: EntityTypeWithMetadata;
    createdIssue: EntityTypeWithMetadata;
    organization: EntityTypeWithMetadata;
    // Organization
    user: EntityTypeWithMetadata;
    // Issue
    assignee: EntityTypeWithMetadata;
    attachment: EntityTypeWithMetadata;
    child: EntityTypeWithMetadata;
    comment: EntityTypeWithMetadata;
    creator: EntityTypeWithMetadata;
    cycle: EntityTypeWithMetadata;
    parent: EntityTypeWithMetadata;
    project: EntityTypeWithMetadata;
    projectMilestone: EntityTypeWithMetadata;
    snoozedBy: EntityTypeWithMetadata;
    subscriber: EntityTypeWithMetadata;
  };
};

// Generic Initializers

const idPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.id,
  possibleValues: [{ primitiveDataType: "text" }],
});

const archivedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.archivedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const createdAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.createdAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const updatedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.updatedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

// Generic Initializers (for HASH)

const createdIssueCountPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.createdIssueCount,
  possibleValues: [{ primitiveDataType: "number" }],
});

const namePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.name,
  possibleValues: [{ primitiveDataType: "text" }],
});

const urlPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.url,
  possibleValues: [{ primitiveDataType: "text" }],
});

const labelLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.label,
});

const teamLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.team,
});

// User Initializers

const activePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.active,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const adminPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.admin,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const avatarUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.avatarUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const descriptionPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.description,
  possibleValues: [{ primitiveDataType: "text" }],
});

const disableReasonPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.disableReason,
  possibleValues: [{ primitiveDataType: "text" }],
});

const displayNamePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.displayName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const emailPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.email,
  possibleValues: [{ primitiveDataType: "text" }],
});

const guestPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.guest,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const inviteHashPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.inviteHash,
  possibleValues: [{ primitiveDataType: "text" }],
});

const isMePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.isMe,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const lastSeenPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.lastSeen,
  possibleValues: [{ primitiveDataType: "text" }],
});

const statusEmojiPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.statusEmoji,
  possibleValues: [{ primitiveDataType: "text" }],
});

const statusLabelPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.statusLabel,
  possibleValues: [{ primitiveDataType: "text" }],
});

const statusUntilAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.statusUntilAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const timezonePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.timezone,
  possibleValues: [{ primitiveDataType: "text" }],
});

const assignedIssueLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.assignedIssue,
});

const createdIssueLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.createdIssue,
});

const organizationLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.organization,
});

export const userEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const activePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.active(context);

  const adminPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.admin(
    context,
  );

  const archivedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.archivedAt(context);

  const assignedIssueLinkType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.assignedIssue(context);

  const issueEntityTypeId = linearTypes.entityType.issue.entityTypeId;

  const avatarUrlPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.avatarUrl(context);

  const createdAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.createdAt(context);

  const createdIssueCountPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.createdIssueCount(context);

  const createdIssueLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.createdIssue(context);

  const descriptionPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.description(context);

  const disableReasonPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.disableReason(context);

  const displayNamePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.displayName(context);

  const emailPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.email(
    context,
  );

  const guestPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.guest(
    context,
  );

  const idPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.id(
    context,
  );

  const inviteHashPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.inviteHash(context);

  const isMePropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.isMe(
    context,
  );

  const lastSeenPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.lastSeen(context);

  const namePropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.name(
    context,
  );

  const organizationLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.organization(context);

  const organizationEntityTypeId =
    linearTypes.entityType.organization.entityTypeId;

  const statusEmojiPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.statusEmoji(context);

  const statusLabelPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.statusLabel(context);

  const statusUntilAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.statusUntilAt(context);

  // const teamLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.team(context);

  // const teamEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.team(
  //   context,
  // );

  const timezonePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.timezone(context);

  const updatedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.updatedAt(context);

  const urlPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.url(
    context,
  );

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...linearTypes.entityType.user,
    properties: [
      {
        propertyType: activePropertyType,
        required: true,
      },
      {
        propertyType: adminPropertyType,
        required: true,
      },
      {
        propertyType: archivedAtPropertyType,
        required: false,
      },
      {
        propertyType: avatarUrlPropertyType,
        required: false,
      },
      {
        propertyType: createdAtPropertyType,
        required: true,
      },
      {
        propertyType: createdIssueCountPropertyType,
        required: true,
      },
      {
        propertyType: descriptionPropertyType,
        required: false,
      },
      {
        propertyType: disableReasonPropertyType,
        required: false,
      },
      {
        propertyType: displayNamePropertyType,
        required: true,
      },
      {
        propertyType: emailPropertyType,
        required: true,
      },
      {
        propertyType: guestPropertyType,
        required: true,
      },
      {
        propertyType: idPropertyType,
        required: true,
      },
      {
        propertyType: inviteHashPropertyType,
        required: true,
      },
      {
        propertyType: isMePropertyType,
        required: true,
      },
      {
        propertyType: lastSeenPropertyType,
        required: false,
      },
      {
        propertyType: namePropertyType,
        required: true,
      },
      {
        propertyType: statusEmojiPropertyType,
        required: false,
      },
      {
        propertyType: statusLabelPropertyType,
        required: false,
      },
      {
        propertyType: statusUntilAtPropertyType,
        required: false,
      },
      {
        propertyType: timezonePropertyType,
        required: false,
      },
      {
        propertyType: updatedAtPropertyType,
        required: true,
      },
      {
        propertyType: urlPropertyType,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkEntityType: assignedIssueLinkType,
        destinationEntityTypes: [issueEntityTypeId],
      },
      {
        linkEntityType: createdIssueLinkEntityType,
        destinationEntityTypes: [issueEntityTypeId],
      },
      {
        linkEntityType: organizationLinkEntityType,
        destinationEntityTypes: [organizationEntityTypeId],
      },
      // {
      //   linkEntityType: teamLinkEntityType,
      //   destinationEntityTypes: [teamEntityType],
      // },
    ],
  })(context);
};

// Organization

const allowedAuthServicePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.allowedAuthService,
  possibleValues: [{ primitiveDataType: "text" }],
});

const deletionRequestedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.deletionRequestedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const gitBranchFormatPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.gitBranchFormat,
  possibleValues: [{ primitiveDataType: "text" }],
});

const gitLinkbackMessagesEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...linearTypes.propertyType.gitLinkbackMessagesEnabled,
    possibleValues: [{ primitiveDataType: "text" }],
  });

const gitPublicLinkbackMessagesEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...linearTypes.propertyType.gitPublicLinkbackMessagesEnabled,
    possibleValues: [{ primitiveDataType: "text" }],
  });

const logoUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.logoUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const periodUploadVolumePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.periodUploadVolume,
  possibleValues: [{ primitiveDataType: "number" }],
});

const previousUrlKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.previousUrlKey,
  possibleValues: [{ primitiveDataType: "text" }],
});

const projectUpdateRemindersDayPropertyTypeInitializer =
  propertyTypeInitializer({
    ...linearTypes.propertyType.projectUpdateRemindersDay,
    possibleValues: [{ primitiveDataType: "text" }],
  });

const projectUpdateRemindersHourPropertyTypeInitializer =
  propertyTypeInitializer({
    ...linearTypes.propertyType.projectUpdateRemindersHour,
    possibleValues: [{ primitiveDataType: "number" }],
  });

const projectUpdatesReminderFrequencyPropertyTypeInitializer =
  propertyTypeInitializer({
    ...linearTypes.propertyType.projectUpdatesReminderFrequency,
    possibleValues: [{ primitiveDataType: "text" }],
  });

const releaseChannelPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.releaseChannel,
  possibleValues: [{ primitiveDataType: "text" }],
});

const roadmapEnabledPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.roadmapEnabled,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const samlEnabledPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.samlEnabled,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const scimEnabledPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.scimEnabled,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const trialEndsAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.trialEndsAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const urlKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.urlKey,
  possibleValues: [{ primitiveDataType: "text" }],
});

const userCountPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.userCount,
  possibleValues: [{ primitiveDataType: "number" }],
});

const userLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.user,
});

const organizationEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const allowedAuthServicePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.allowedAuthService(context);

  const archivedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.archivedAt(context);

  const createdAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.createdAt(context);

  const createdIssueCountPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.createdIssueCount(context);

  const deletionRequestedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.deletionRequestedAt(context);

  const gitBranchFormatPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.gitBranchFormat(context);

  const gitLinkbackMessagesEnabledPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.gitLinkbackMessagesEnabled(
      context,
    );

  const gitPublicLinkbackMessagesEnabledPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.gitPublicLinkbackMessagesEnabled(
      context,
    );

  const idPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.id(
    context,
  );

  const logoUrlPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.logoUrl(context);

  const namePropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.name(
    context,
  );

  const periodUploadVolumePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.periodUploadVolume(context);

  const previousUrlKeyPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.previousUrlKey(context);

  const projectUpdateRemindersDayPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.projectUpdateRemindersDay(
      context,
    );

  const projectUpdateRemindersHourPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.projectUpdateRemindersHour(
      context,
    );

  const projectUpdatesReminderFrequencyPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.projectUpdatesReminderFrequency(
      context,
    );

  const releaseChannelPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.releaseChannel(context);

  const roadmapEnabledPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.roadmapEnabled(context);

  const samlEnabledPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.samlEnabled(context);

  const scimEnabledPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.scimEnabled(context);

  const trialEndsAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.trialEndsAt(context);

  const updatedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.updatedAt(context);

  const urlKeyPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.urlKey(context);

  const userCountPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.userCount(context);

  // const labelLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.label(context);

  // const labelEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.label(
  //   context,
  // );

  // const teamLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.team(context);

  // const teamEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.team(
  //   context,
  // );

  const userLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.user(context);

  const userEntityTypeId = linearTypes.entityType.user.entityTypeId;

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...linearTypes.entityType.organization,
    properties: [
      {
        propertyType: allowedAuthServicePropertyType,
        required: true,
        array: true,
      },
      {
        propertyType: archivedAtPropertyType,
        required: false,
      },
      {
        propertyType: createdAtPropertyType,
        required: true,
      },
      {
        propertyType: createdIssueCountPropertyType,
        required: true,
      },
      {
        propertyType: deletionRequestedAtPropertyType,
        required: false,
      },
      {
        propertyType: gitBranchFormatPropertyType,
        required: false,
      },
      {
        propertyType: gitLinkbackMessagesEnabledPropertyType,
        required: true,
      },
      {
        propertyType: gitPublicLinkbackMessagesEnabledPropertyType,
        required: true,
      },
      {
        propertyType: idPropertyType,
        required: true,
      },
      {
        propertyType: logoUrlPropertyType,
        required: false,
      },
      {
        propertyType: namePropertyType,
        required: true,
      },
      {
        propertyType: periodUploadVolumePropertyType,
        required: true,
      },
      {
        propertyType: previousUrlKeyPropertyType,
        required: true,
        array: true,
      },
      {
        propertyType: projectUpdateRemindersDayPropertyType,
        required: true,
      },
      {
        propertyType: projectUpdateRemindersHourPropertyType,
        required: true,
      },
      {
        propertyType: projectUpdatesReminderFrequencyPropertyType,
        required: true,
      },
      {
        propertyType: releaseChannelPropertyType,
        required: true,
      },
      {
        propertyType: roadmapEnabledPropertyType,
        required: true,
      },
      {
        propertyType: samlEnabledPropertyType,
        required: true,
      },
      {
        propertyType: scimEnabledPropertyType,
        required: true,
      },
      {
        propertyType: trialEndsAtPropertyType,
        required: false,
      },
      {
        propertyType: updatedAtPropertyType,
        required: true,
      },
      {
        propertyType: urlKeyPropertyType,
        required: true,
      },
      {
        propertyType: userCountPropertyType,
        required: true,
      },
    ],
    outgoingLinks: [
      // {
      //   linkEntityType: labelLinkEntityType,
      //   destinationEntityTypes: [labelEntityType],
      // },
      // {
      //   linkEntityType: teamLinkEntityType,
      //   destinationEntityTypes: [teamEntityType],
      // },
      {
        linkEntityType: userLinkEntityType,
        destinationEntityTypes: [userEntityTypeId],
      },
    ],
  })(context);
};

// Issue

const autoArchivedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.autoArchivedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const autoClosedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.autoClosedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const branchNamePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.branchName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const canceledAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.canceledAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const completedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.completedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const customerTicketCountPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.customerTicketCount,
  possibleValues: [{ primitiveDataType: "number" }],
});

const markdownDescriptionPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.markdownDescription,
  possibleValues: [{ primitiveDataType: "text" }],
});

const dueDatePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.dueDate,
  possibleValues: [{ primitiveDataType: "text" }],
});

const estimatePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.estimate,
  possibleValues: [{ primitiveDataType: "number" }],
});

const identifierPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.identifier,
  possibleValues: [{ primitiveDataType: "text" }],
});

const numberPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.number,
  possibleValues: [{ primitiveDataType: "number" }],
});

const previousIdentifierPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.previousIdentifier,
  possibleValues: [{ primitiveDataType: "text" }],
});

const priorityPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.priority,
  possibleValues: [{ primitiveDataType: "number" }],
});

const priorityLabelPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.priorityLabel,
  possibleValues: [{ primitiveDataType: "text" }],
});

const snoozedUntilAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.snoozedUntilAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const sortOrderPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.sortOrder,
  possibleValues: [{ primitiveDataType: "number" }],
});

const startedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.startedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const startedTriageAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.startedTriageAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const subIssueSortOrderPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.subIssueSortOrder,
  possibleValues: [{ primitiveDataType: "number" }],
});

const titlePropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.title,
  possibleValues: [{ primitiveDataType: "text" }],
});

const trashedPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.trashed,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const triagedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...linearTypes.propertyType.triagedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const assigneeLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.assignee,
});

const attachmentLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.attachment,
});

const childLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.child,
});

const commentLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.comment,
});

const creatorLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.creator,
});

const cycleLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.cycle,
});

const parentLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.parent,
});

const projectLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.project,
});

const projectMilestoneLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.projectMilestone,
});

const snoozedByLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.snoozedBy,
});

const subscriberLinkEntityTypeInitializer = entityTypeInitializer({
  ...linearTypes.linkEntityType.subscriber,
});

const issueEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const archivedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.archivedAt(context);

  const assigneeLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.assignee(context);

  const userEntityTypeId = linearTypes.entityType.user.entityTypeId;

  // const attachmentLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.attachment(context);

  // const attachmentEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.entityType.attachment(context);

  const autoArchivedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.autoArchivedAt(context);

  const autoClosedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.autoClosedAt(context);

  const branchNamePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.branchName(context);

  const canceledAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.canceledAt(context);

  const childLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.child(context);

  // const commentLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.comment(context);

  // const commentEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.comment(
  //   context,
  // );

  const completedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.completedAt(context);

  const createdAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.createdAt(context);

  const creatorLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.creator(context);

  const customerTicketCountPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.customerTicketCount(context);

  // const cycleLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.cycle(context);

  // const cycleEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.cycle(
  //   context,
  // );

  const markdownDescriptionPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.markdownDescription(context);

  const dueDatePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.dueDate(context);

  const estimatePropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.estimate(context);

  const idPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.id(
    context,
  );

  const identifierPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.identifier(context);

  // const labelLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.label(context);

  // const labelEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.label(
  //   context,
  // );

  const numberPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.number(context);

  const parentLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.parent(context);

  const previousIdentifierPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.previousIdentifier(context);

  const priorityPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.priority(context);

  const priorityLabelPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.priorityLabel(context);

  // const projectLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.project(context);

  // const projectEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.project(
  //   context,
  // );

  // const projectMilestoneLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.projectMilestone(context);

  // const projectMilestoneEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.entityType.projectMilestone(context);

  const snoozedByLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.snoozedBy(context);

  const snoozedUntilAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.snoozedUntilAt(context);

  const sortOrderPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.sortOrder(context);

  const startedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.startedAt(context);

  const startedTriageAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.startedTriageAt(context);

  const subIssueSortOrderPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.subIssueSortOrder(context);

  const subscriberLinkEntityType =
    await LINEAR_TYPES_INITIALIZERS.linkEntityType.subscriber(context);

  // const teamLinkEntityType =
  //   await LINEAR_TYPES_INITIALIZERS.linkEntityType.team(context);

  // const teamEntityType = await LINEAR_TYPES_INITIALIZERS.entityType.team(
  //   context,
  // );

  const titlePropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.title(
    context,
  );

  const trashedPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.trashed(context);

  const triagedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.triagedAt(context);

  const updatedAtPropertyType =
    await LINEAR_TYPES_INITIALIZERS.propertyType.updatedAt(context);

  const urlPropertyType = await LINEAR_TYPES_INITIALIZERS.propertyType.url(
    context,
  );

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...linearTypes.entityType.issue,
    properties: [
      {
        propertyType: archivedAtPropertyType,
        required: false,
      },
      {
        propertyType: autoArchivedAtPropertyType,
        required: false,
      },
      {
        propertyType: autoClosedAtPropertyType,
        required: false,
      },
      {
        propertyType: branchNamePropertyType,
        required: true,
      },
      {
        propertyType: canceledAtPropertyType,
        required: false,
      },
      {
        propertyType: completedAtPropertyType,
        required: false,
      },
      {
        propertyType: createdAtPropertyType,
        required: true,
      },
      {
        propertyType: customerTicketCountPropertyType,
        required: true,
      },
      {
        propertyType: markdownDescriptionPropertyType,
        required: false,
      },
      {
        propertyType: dueDatePropertyType,
        required: false,
      },
      {
        propertyType: estimatePropertyType,
        required: false,
      },
      {
        propertyType: idPropertyType,
        required: true,
      },
      {
        propertyType: identifierPropertyType,
        required: true,
      },
      {
        propertyType: numberPropertyType,
        required: true,
      },
      {
        propertyType: previousIdentifierPropertyType,
        required: true,
        array: true,
      },
      {
        propertyType: priorityPropertyType,
        required: true,
      },
      {
        propertyType: priorityLabelPropertyType,
        required: true,
      },
      {
        propertyType: snoozedUntilAtPropertyType,
        required: false,
      },
      {
        propertyType: sortOrderPropertyType,
        required: true,
      },
      {
        propertyType: startedAtPropertyType,
        required: false,
      },
      {
        propertyType: startedTriageAtPropertyType,
        required: false,
      },

      {
        propertyType: subIssueSortOrderPropertyType,
        required: false,
      },
      {
        propertyType: titlePropertyType,
        required: true,
      },
      {
        propertyType: trashedPropertyType,
        required: false,
      },
      {
        propertyType: triagedAtPropertyType,
        required: false,
      },
      {
        propertyType: updatedAtPropertyType,
        required: true,
      },
      {
        propertyType: urlPropertyType,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkEntityType: assigneeLinkEntityType,
        destinationEntityTypes: [userEntityTypeId],
      },
      // {
      //   linkEntityType: attachmentLinkEntityType,
      //   destinationEntityTypes: [attachmentEntityType],
      // },
      {
        linkEntityType: childLinkEntityType,
        destinationEntityTypes: ["SELF_REFERENCE"],
      },
      // {
      //   linkEntityType: commentLinkEntityType,
      //   destinationEntityTypes: [commentEntityType],
      // },
      {
        linkEntityType: creatorLinkEntityType,
        destinationEntityTypes: [userEntityTypeId],
      },
      // {
      //   linkEntityType: cycleLinkEntityType,
      //   destinationEntityTypes: [cycleEntityType],
      // },
      // {
      //   linkEntityType: labelLinkEntityType,
      //   destinationEntityTypes: [labelEntityType],
      // },
      {
        linkEntityType: parentLinkEntityType,
        destinationEntityTypes: ["SELF_REFERENCE"],
      },
      // {
      //   linkEntityType: projectLinkEntityType,
      //   destinationEntityTypes: [projectEntityType],
      // },
      // {
      //   linkEntityType: projectMilestoneLinkEntityType,
      //   destinationEntityTypes: [projectMilestoneEntityType],
      // },
      {
        linkEntityType: snoozedByLinkEntityType,
        destinationEntityTypes: [userEntityTypeId],
      },
      {
        linkEntityType: subscriberLinkEntityType,
        destinationEntityTypes: [userEntityTypeId],
      },
      // {
      //   linkEntityType: teamLinkEntityType,
      //   destinationEntityTypes: [teamEntityType],
      // },
    ],
  })(context);
};

type LazyPromise<T> = (context: ImpureGraphContext) => Promise<T>;

type FlattenAndPromisify<T> = {
  [K in keyof T]: T[K] extends object
    ? { [I in keyof T[K]]: LazyPromise<T[K][I]> }
    : never;
};

export const LINEAR_TYPES_INITIALIZERS: FlattenAndPromisify<
  typeof LINEAR_TYPES
> = {
  propertyType: {
    // Generic
    id: idPropertyTypeInitializer,
    archivedAt: archivedAtPropertyTypeInitializer,
    createdAt: createdAtPropertyTypeInitializer,
    updatedAt: updatedAtPropertyTypeInitializer,
    // Generic (for HASH)
    createdIssueCount: createdIssueCountPropertyTypeInitializer,
    name: namePropertyTypeInitializer,
    url: urlPropertyTypeInitializer,
    // User
    active: activePropertyTypeInitializer,
    admin: adminPropertyTypeInitializer,
    avatarUrl: avatarUrlPropertyTypeInitializer,
    description: descriptionPropertyTypeInitializer,
    disableReason: disableReasonPropertyTypeInitializer,
    displayName: displayNamePropertyTypeInitializer,
    email: emailPropertyTypeInitializer,
    guest: guestPropertyTypeInitializer,
    inviteHash: inviteHashPropertyTypeInitializer,
    isMe: isMePropertyTypeInitializer,
    lastSeen: lastSeenPropertyTypeInitializer,
    statusEmoji: statusEmojiPropertyTypeInitializer,
    statusLabel: statusLabelPropertyTypeInitializer,
    statusUntilAt: statusUntilAtPropertyTypeInitializer,
    timezone: timezonePropertyTypeInitializer,
    // Organization
    allowedAuthService: allowedAuthServicePropertyTypeInitializer,
    deletionRequestedAt: deletionRequestedAtPropertyTypeInitializer,
    gitBranchFormat: gitBranchFormatPropertyTypeInitializer,
    gitLinkbackMessagesEnabled:
      gitLinkbackMessagesEnabledPropertyTypeInitializer,
    gitPublicLinkbackMessagesEnabled:
      gitPublicLinkbackMessagesEnabledPropertyTypeInitializer,
    logoUrl: logoUrlPropertyTypeInitializer,
    periodUploadVolume: periodUploadVolumePropertyTypeInitializer,
    previousUrlKey: previousUrlKeyPropertyTypeInitializer,
    projectUpdateRemindersDay: projectUpdateRemindersDayPropertyTypeInitializer,
    projectUpdateRemindersHour:
      projectUpdateRemindersHourPropertyTypeInitializer,
    projectUpdatesReminderFrequency:
      projectUpdatesReminderFrequencyPropertyTypeInitializer,
    releaseChannel: releaseChannelPropertyTypeInitializer,
    roadmapEnabled: roadmapEnabledPropertyTypeInitializer,
    samlEnabled: samlEnabledPropertyTypeInitializer,
    scimEnabled: scimEnabledPropertyTypeInitializer,
    trialEndsAt: trialEndsAtPropertyTypeInitializer,
    urlKey: urlKeyPropertyTypeInitializer,
    userCount: userCountPropertyTypeInitializer,
    // Issue
    autoArchivedAt: autoArchivedAtPropertyTypeInitializer,
    autoClosedAt: autoClosedAtPropertyTypeInitializer,
    branchName: branchNamePropertyTypeInitializer,
    canceledAt: canceledAtPropertyTypeInitializer,
    completedAt: completedAtPropertyTypeInitializer,
    customerTicketCount: customerTicketCountPropertyTypeInitializer,
    markdownDescription: markdownDescriptionPropertyTypeInitializer,
    dueDate: dueDatePropertyTypeInitializer,
    estimate: estimatePropertyTypeInitializer,
    identifier: identifierPropertyTypeInitializer,
    number: numberPropertyTypeInitializer,
    previousIdentifier: previousIdentifierPropertyTypeInitializer,
    priority: priorityPropertyTypeInitializer,
    priorityLabel: priorityLabelPropertyTypeInitializer,
    snoozedUntilAt: snoozedUntilAtPropertyTypeInitializer,
    sortOrder: sortOrderPropertyTypeInitializer,
    startedAt: startedAtPropertyTypeInitializer,
    startedTriageAt: startedTriageAtPropertyTypeInitializer,
    subIssueSortOrder: subIssueSortOrderPropertyTypeInitializer,
    title: titlePropertyTypeInitializer,
    trashed: trashedPropertyTypeInitializer,
    triagedAt: triagedAtPropertyTypeInitializer,
  },
  entityType: {
    organization: organizationEntityTypeInitializer,
    issue: issueEntityTypeInitializer,
    user: userEntityTypeInitializer,
  },
  linkEntityType: {
    // Generic (for HASH)
    label: labelLinkEntityTypeInitializer,
    team: teamLinkEntityTypeInitializer,
    // User
    assignedIssue: assignedIssueLinkEntityTypeInitializer,
    createdIssue: createdIssueLinkEntityTypeInitializer,
    organization: organizationLinkEntityTypeInitializer,
    // Organization
    user: userLinkEntityTypeInitializer,
    // Issue
    assignee: assigneeLinkEntityTypeInitializer,
    attachment: attachmentLinkEntityTypeInitializer,
    child: childLinkEntityTypeInitializer,
    comment: commentLinkEntityTypeInitializer,
    creator: creatorLinkEntityTypeInitializer,
    cycle: cycleLinkEntityTypeInitializer,
    parent: parentLinkEntityTypeInitializer,
    project: projectLinkEntityTypeInitializer,
    projectMilestone: projectMilestoneLinkEntityTypeInitializer,
    snoozedBy: snoozedByLinkEntityTypeInitializer,
    subscriber: subscriberLinkEntityTypeInitializer,
  },
};

/**
 * Ensures the required system types have been created in the graph by fetching
 * them or creating them using the `systemUserAccountId`. Note this method must
 * be run after the `systemUserAccountId` has been initialized.
 */
export const ensureLinearTypesExist = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { context } = params;

  logger.debug("Ensuring linear types exist");

  // Create linear types if they don't already exist
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  const initializedLinearTypes: any = {};

  // eslint-disable-next-line guard-for-in
  for (const typeKind in LINEAR_TYPES_INITIALIZERS) {
    initializedLinearTypes[typeKind] = {};

    const inner =
      LINEAR_TYPES_INITIALIZERS[
        typeKind as keyof typeof LINEAR_TYPES_INITIALIZERS
      ];
    for (const [key, typeInitializer] of Object.entries(inner) as [
      string,
      (
        context: ImpureGraphContext,
      ) => Promise<
        PropertyTypeWithMetadata | DataTypeWithMetadata | EntityTypeWithMetadata
      >,
    ][]) {
      logger.debug(`Checking linear type: [${key}] exists`);
      const type = await typeInitializer(context);
      initializedLinearTypes[typeKind][key] = type;
    }
  }

  LINEAR_TYPES = initializedLinearTypes;
};
