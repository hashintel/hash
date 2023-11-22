/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ActivePropertyValue,
  AdminPropertyValue,
  AllowedAuthServicePropertyValue,
  AllowMembersToInvitePropertyValue,
  ArchivedAtPropertyValue,
  AutoArchivedAtPropertyValue,
  AutoClosedAtPropertyValue,
  AvatarURLPropertyValue,
  BelongsToOrganization,
  BelongsToOrganizationOutgoingLinkAndTarget,
  BelongsToOrganizationOutgoingLinksByLinkEntityTypeId,
  BelongsToOrganizationProperties,
  BooleanDataType,
  BranchNamePropertyValue,
  CanceledAtPropertyValue,
  CompletedAtPropertyValue,
  CreatedAtPropertyValue,
  CreatedIssueCountPropertyValue,
  CustomerTicketCountPropertyValue,
  DeletionRequestedAtPropertyValue,
  DescriptionPropertyValue,
  DisableReasonPropertyValue,
  DisplayNamePropertyValue,
  DueDatePropertyValue,
  EmailPropertyValue,
  EstimatePropertyValue,
  FullNamePropertyValue,
  GitBranchFormatPropertyValue,
  GitLinkbackMessagesEnabledPropertyValue,
  GitPublicLinkbackMessagesEnabledPropertyValue,
  GuestPropertyValue,
  HasAssignee,
  HasAssigneeOutgoingLinkAndTarget,
  HasAssigneeOutgoingLinksByLinkEntityTypeId,
  HasAssigneeProperties,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  IdentifierPropertyValue,
  IDPropertyValue,
  IntegrationSourceTypePropertyValue,
  InviteHashPropertyValue,
  IsMePropertyValue,
  Issue,
  IssueHasAssigneeLink,
  IssueHasCreatorLink,
  IssueHasSubscriberLink,
  IssueNumberPropertyValue,
  IssueOutgoingLinkAndTarget,
  IssueOutgoingLinksByLinkEntityTypeId,
  IssueParentLink,
  IssueProperties,
  IssueSnoozedByLink,
  IssueStateLink,
  IssueURLPropertyValue,
  LastSeenPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LogoURLPropertyValue,
  MarkdownDescriptionPropertyValue,
  NamePropertyValue,
  NumberDataType,
  Organization,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  PeriodUploadVolumePropertyValue,
  PreviousIdentifierPropertyValue,
  PreviousURLKeysPropertyValue,
  PriorityLabelPropertyValue,
  PriorityPropertyValue,
  ProfileURLPropertyValue,
  ProjectUpdateRemindersDayPropertyValue,
  ProjectUpdateRemindersHourPropertyValue,
  ProjectUpdatesReminderFrequencyPropertyValue,
  ReleaseChannelPropertyValue,
  RoadmapEnabledPropertyValue,
  SAMLEnabledPropertyValue,
  SCIMEnabledPropertyValue,
  SLADayCountPropertyValue,
  SnoozedBy,
  SnoozedByOutgoingLinkAndTarget,
  SnoozedByOutgoingLinksByLinkEntityTypeId,
  SnoozedByProperties,
  SnoozedUntilAtPropertyValue,
  SortOrderPropertyValue,
  StartedAtPropertyValue,
  StartedTriageAtPropertyValue,
  State,
  StateOutgoingLinkAndTarget,
  StateOutgoingLinksByLinkEntityTypeId,
  StateProperties,
  StatusEmojiPropertyValue,
  StatusLabelPropertyValue,
  StatusUntilAtPropertyValue,
  SubIssueSortOrderPropertyValue,
  TextDataType,
  TimezonePropertyValue,
  Title1PropertyValue,
  TrashedPropertyValue,
  TriagedAtPropertyValue,
  TrialEndsAtPropertyValue,
  UpdatedAtPropertyValue,
  URLKeyPropertyValue,
  User,
  UserBelongsToOrganizationLink,
  UserCountPropertyValue,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
} from "./shared";

export type {
  ActivePropertyValue,
  AdminPropertyValue,
  AllowedAuthServicePropertyValue,
  AllowMembersToInvitePropertyValue,
  ArchivedAtPropertyValue,
  AutoArchivedAtPropertyValue,
  AutoClosedAtPropertyValue,
  AvatarURLPropertyValue,
  BelongsToOrganization,
  BelongsToOrganizationOutgoingLinkAndTarget,
  BelongsToOrganizationOutgoingLinksByLinkEntityTypeId,
  BelongsToOrganizationProperties,
  BooleanDataType,
  BranchNamePropertyValue,
  CanceledAtPropertyValue,
  CompletedAtPropertyValue,
  CreatedAtPropertyValue,
  CreatedIssueCountPropertyValue,
  CustomerTicketCountPropertyValue,
  DeletionRequestedAtPropertyValue,
  DescriptionPropertyValue,
  DisableReasonPropertyValue,
  DisplayNamePropertyValue,
  DueDatePropertyValue,
  EmailPropertyValue,
  EstimatePropertyValue,
  FullNamePropertyValue,
  GitBranchFormatPropertyValue,
  GitLinkbackMessagesEnabledPropertyValue,
  GitPublicLinkbackMessagesEnabledPropertyValue,
  GuestPropertyValue,
  HasAssignee,
  HasAssigneeOutgoingLinkAndTarget,
  HasAssigneeOutgoingLinksByLinkEntityTypeId,
  HasAssigneeProperties,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  IdentifierPropertyValue,
  IDPropertyValue,
  IntegrationSourceTypePropertyValue,
  InviteHashPropertyValue,
  IsMePropertyValue,
  Issue,
  IssueHasAssigneeLink,
  IssueHasCreatorLink,
  IssueHasSubscriberLink,
  IssueNumberPropertyValue,
  IssueOutgoingLinkAndTarget,
  IssueOutgoingLinksByLinkEntityTypeId,
  IssueParentLink,
  IssueProperties,
  IssueSnoozedByLink,
  IssueStateLink,
  IssueURLPropertyValue,
  LastSeenPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LogoURLPropertyValue,
  MarkdownDescriptionPropertyValue,
  NamePropertyValue,
  NumberDataType,
  Organization,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  PeriodUploadVolumePropertyValue,
  PreviousIdentifierPropertyValue,
  PreviousURLKeysPropertyValue,
  PriorityLabelPropertyValue,
  PriorityPropertyValue,
  ProfileURLPropertyValue,
  ProjectUpdateRemindersDayPropertyValue,
  ProjectUpdateRemindersHourPropertyValue,
  ProjectUpdatesReminderFrequencyPropertyValue,
  ReleaseChannelPropertyValue,
  RoadmapEnabledPropertyValue,
  SAMLEnabledPropertyValue,
  SCIMEnabledPropertyValue,
  SLADayCountPropertyValue,
  SnoozedBy,
  SnoozedByOutgoingLinkAndTarget,
  SnoozedByOutgoingLinksByLinkEntityTypeId,
  SnoozedByProperties,
  SnoozedUntilAtPropertyValue,
  SortOrderPropertyValue,
  StartedAtPropertyValue,
  StartedTriageAtPropertyValue,
  State,
  StateOutgoingLinkAndTarget,
  StateOutgoingLinksByLinkEntityTypeId,
  StateProperties,
  StatusEmojiPropertyValue,
  StatusLabelPropertyValue,
  StatusUntilAtPropertyValue,
  SubIssueSortOrderPropertyValue,
  TextDataType,
  TimezonePropertyValue,
  Title1PropertyValue,
  TrashedPropertyValue,
  TriagedAtPropertyValue,
  TrialEndsAtPropertyValue,
  UpdatedAtPropertyValue,
  URLKeyPropertyValue,
  User,
  UserBelongsToOrganizationLink,
  UserCountPropertyValue,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
};

export type Attachment = Entity<AttachmentProperties>;

export type AttachmentBelongsToIssueLink = {
  linkEntity: BelongsToIssue;
  rightEntity: Issue;
};

export type AttachmentHasCreatorLink = {
  linkEntity: HasCreator;
  rightEntity: User;
};

export type AttachmentOutgoingLinkAndTarget =
  | AttachmentBelongsToIssueLink
  | AttachmentHasCreatorLink;

export type AttachmentOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/belongs-to-issue/v/1": AttachmentBelongsToIssueLink;
  "https://hash.ai/@linear/types/entity-type/has-creator/v/1": AttachmentHasCreatorLink;
};

/**
 * Issue attachment (e.g. support ticket, pull request).
 */
export type AttachmentProperties = {
  "https://hash.ai/@hash/types/property-type/title/"?: Title0PropertyValue;
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/attachment-url/": AttachmentURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-at/"?: CreatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/group-by-source/": GroupBySourcePropertyValue;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValue;
  "https://hash.ai/@linear/types/property-type/metadata/": MetadataPropertyValue;
  "https://hash.ai/@linear/types/property-type/source-type/"?: SourceTypePropertyValue;
  "https://hash.ai/@linear/types/property-type/source/"?: SourcePropertyValue;
  "https://hash.ai/@linear/types/property-type/subtitle/"?: SubtitlePropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
};

/**
 * Location of the attachment which is also used as an identifier.
 */
export type AttachmentURLPropertyValue = TextDataType;

export type BelongsToIssue = Entity<BelongsToIssueProperties> & {
  linkData: LinkData;
};

export type BelongsToIssueOutgoingLinkAndTarget = never;

export type BelongsToIssueOutgoingLinksByLinkEntityTypeId = {};

/**
 * The issue this attachment belongs to.
 */
export type BelongsToIssueProperties = BelongsToIssueProperties1 &
  BelongsToIssueProperties2;
export type BelongsToIssueProperties1 = LinkProperties;

export type BelongsToIssueProperties2 = {};

/**
 * Indicates if attachments for the same source application should be grouped in the Linear UI.
 */
export type GroupBySourcePropertyValue = BooleanDataType;

/**
 * Custom metadata related to the attachment.
 */
export type MetadataPropertyValue = ObjectDataType;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

/**
 * Information about the source which created the attachment.
 */
export type SourcePropertyValue = ObjectDataType;

/**
 * An accessor helper to source.type, defines the source type of the attachment.
 */
export type SourceTypePropertyValue = TextDataType;

/**
 * Content for the subtitle line in the Linear attachment widget.
 */
export type SubtitlePropertyValue = TextDataType;

/**
 * The title of something.
 */
export type Title0PropertyValue = TextDataType;
