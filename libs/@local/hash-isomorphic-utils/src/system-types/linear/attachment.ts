/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { Confidence } from "@local/hash-graph-types/entity";

import type {
  ActivePropertyValue,
  ActivePropertyValueWithMetadata,
  AdminPropertyValue,
  AdminPropertyValueWithMetadata,
  AllowedAuthServicePropertyValue,
  AllowedAuthServicePropertyValueWithMetadata,
  AllowMembersToInvitePropertyValue,
  AllowMembersToInvitePropertyValueWithMetadata,
  ArchivedAtPropertyValue,
  ArchivedAtPropertyValueWithMetadata,
  AutoArchivedAtPropertyValue,
  AutoArchivedAtPropertyValueWithMetadata,
  AutoClosedAtPropertyValue,
  AutoClosedAtPropertyValueWithMetadata,
  AvatarURLPropertyValue,
  AvatarURLPropertyValueWithMetadata,
  BelongsToOrganization,
  BelongsToOrganizationOutgoingLinkAndTarget,
  BelongsToOrganizationOutgoingLinksByLinkEntityTypeId,
  BelongsToOrganizationProperties,
  BelongsToOrganizationPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BranchNamePropertyValue,
  BranchNamePropertyValueWithMetadata,
  CanceledAtPropertyValue,
  CanceledAtPropertyValueWithMetadata,
  CompletedAtPropertyValue,
  CompletedAtPropertyValueWithMetadata,
  CreatedAtPropertyValue,
  CreatedAtPropertyValueWithMetadata,
  CreatedIssueCountPropertyValue,
  CreatedIssueCountPropertyValueWithMetadata,
  CustomerTicketCountPropertyValue,
  CustomerTicketCountPropertyValueWithMetadata,
  DeletionRequestedAtPropertyValue,
  DeletionRequestedAtPropertyValueWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisableReasonPropertyValue,
  DisableReasonPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  DueDatePropertyValue,
  DueDatePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  EstimatePropertyValue,
  EstimatePropertyValueWithMetadata,
  FullNamePropertyValue,
  FullNamePropertyValueWithMetadata,
  GitBranchFormatPropertyValue,
  GitBranchFormatPropertyValueWithMetadata,
  GitLinkbackMessagesEnabledPropertyValue,
  GitLinkbackMessagesEnabledPropertyValueWithMetadata,
  GitPublicLinkbackMessagesEnabledPropertyValue,
  GitPublicLinkbackMessagesEnabledPropertyValueWithMetadata,
  GuestPropertyValue,
  GuestPropertyValueWithMetadata,
  HasAssignee,
  HasAssigneeOutgoingLinkAndTarget,
  HasAssigneeOutgoingLinksByLinkEntityTypeId,
  HasAssigneeProperties,
  HasAssigneePropertiesWithMetadata,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasCreatorPropertiesWithMetadata,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  HasSubscriberPropertiesWithMetadata,
  IdentifierPropertyValue,
  IdentifierPropertyValueWithMetadata,
  IDPropertyValue,
  IDPropertyValueWithMetadata,
  IntegrationSourceTypePropertyValue,
  IntegrationSourceTypePropertyValueWithMetadata,
  InviteHashPropertyValue,
  InviteHashPropertyValueWithMetadata,
  IsMePropertyValue,
  IsMePropertyValueWithMetadata,
  Issue,
  IssueHasAssigneeLink,
  IssueHasCreatorLink,
  IssueHasSubscriberLink,
  IssueNumberPropertyValue,
  IssueNumberPropertyValueWithMetadata,
  IssueOutgoingLinkAndTarget,
  IssueOutgoingLinksByLinkEntityTypeId,
  IssueParentLink,
  IssueProperties,
  IssuePropertiesWithMetadata,
  IssueSnoozedByLink,
  IssueStateLink,
  IssueURLPropertyValue,
  IssueURLPropertyValueWithMetadata,
  LastSeenPropertyValue,
  LastSeenPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LogoURLPropertyValue,
  LogoURLPropertyValueWithMetadata,
  MarkdownDescriptionPropertyValue,
  MarkdownDescriptionPropertyValueWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  Organization,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OrganizationPropertiesWithMetadata,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  ParentPropertiesWithMetadata,
  PeriodUploadVolumePropertyValue,
  PeriodUploadVolumePropertyValueWithMetadata,
  PreviousIdentifierPropertyValue,
  PreviousIdentifierPropertyValueWithMetadata,
  PreviousURLKeysPropertyValue,
  PreviousURLKeysPropertyValueWithMetadata,
  PriorityLabelPropertyValue,
  PriorityLabelPropertyValueWithMetadata,
  PriorityPropertyValue,
  PriorityPropertyValueWithMetadata,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ProjectUpdateRemindersHourPropertyValue,
  ProjectUpdateRemindersHourPropertyValueWithMetadata,
  RoadmapEnabledPropertyValue,
  RoadmapEnabledPropertyValueWithMetadata,
  SAMLEnabledPropertyValue,
  SAMLEnabledPropertyValueWithMetadata,
  SCIMEnabledPropertyValue,
  SCIMEnabledPropertyValueWithMetadata,
  SnoozedBy,
  SnoozedByOutgoingLinkAndTarget,
  SnoozedByOutgoingLinksByLinkEntityTypeId,
  SnoozedByProperties,
  SnoozedByPropertiesWithMetadata,
  SnoozedUntilAtPropertyValue,
  SnoozedUntilAtPropertyValueWithMetadata,
  SortOrderPropertyValue,
  SortOrderPropertyValueWithMetadata,
  StartedAtPropertyValue,
  StartedAtPropertyValueWithMetadata,
  StartedTriageAtPropertyValue,
  StartedTriageAtPropertyValueWithMetadata,
  State,
  StateOutgoingLinkAndTarget,
  StateOutgoingLinksByLinkEntityTypeId,
  StateProperties,
  StatePropertiesWithMetadata,
  StatusEmojiPropertyValue,
  StatusEmojiPropertyValueWithMetadata,
  StatusLabelPropertyValue,
  StatusLabelPropertyValueWithMetadata,
  StatusUntilAtPropertyValue,
  StatusUntilAtPropertyValueWithMetadata,
  SubIssueSortOrderPropertyValue,
  SubIssueSortOrderPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimezonePropertyValue,
  TimezonePropertyValueWithMetadata,
  Title1PropertyValue,
  TitlePropertyValueWithMetadata1,
  TrashedPropertyValue,
  TrashedPropertyValueWithMetadata,
  TriagedAtPropertyValue,
  TriagedAtPropertyValueWithMetadata,
  TrialEndsAtPropertyValue,
  TrialEndsAtPropertyValueWithMetadata,
  UpdatedAtPropertyValue,
  UpdatedAtPropertyValueWithMetadata,
  URLKeyPropertyValue,
  URLKeyPropertyValueWithMetadata,
  User,
  UserBelongsToOrganizationLink,
  UserCountPropertyValue,
  UserCountPropertyValueWithMetadata,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserPropertiesWithMetadata,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
  WorkflowStatePropertiesWithMetadata,
} from "./shared";

export type {
  ActivePropertyValue,
  ActivePropertyValueWithMetadata,
  AdminPropertyValue,
  AdminPropertyValueWithMetadata,
  AllowedAuthServicePropertyValue,
  AllowedAuthServicePropertyValueWithMetadata,
  AllowMembersToInvitePropertyValue,
  AllowMembersToInvitePropertyValueWithMetadata,
  ArchivedAtPropertyValue,
  ArchivedAtPropertyValueWithMetadata,
  AutoArchivedAtPropertyValue,
  AutoArchivedAtPropertyValueWithMetadata,
  AutoClosedAtPropertyValue,
  AutoClosedAtPropertyValueWithMetadata,
  AvatarURLPropertyValue,
  AvatarURLPropertyValueWithMetadata,
  BelongsToOrganization,
  BelongsToOrganizationOutgoingLinkAndTarget,
  BelongsToOrganizationOutgoingLinksByLinkEntityTypeId,
  BelongsToOrganizationProperties,
  BelongsToOrganizationPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BranchNamePropertyValue,
  BranchNamePropertyValueWithMetadata,
  CanceledAtPropertyValue,
  CanceledAtPropertyValueWithMetadata,
  CompletedAtPropertyValue,
  CompletedAtPropertyValueWithMetadata,
  CreatedAtPropertyValue,
  CreatedAtPropertyValueWithMetadata,
  CreatedIssueCountPropertyValue,
  CreatedIssueCountPropertyValueWithMetadata,
  CustomerTicketCountPropertyValue,
  CustomerTicketCountPropertyValueWithMetadata,
  DeletionRequestedAtPropertyValue,
  DeletionRequestedAtPropertyValueWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisableReasonPropertyValue,
  DisableReasonPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  DueDatePropertyValue,
  DueDatePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  EstimatePropertyValue,
  EstimatePropertyValueWithMetadata,
  FullNamePropertyValue,
  FullNamePropertyValueWithMetadata,
  GitBranchFormatPropertyValue,
  GitBranchFormatPropertyValueWithMetadata,
  GitLinkbackMessagesEnabledPropertyValue,
  GitLinkbackMessagesEnabledPropertyValueWithMetadata,
  GitPublicLinkbackMessagesEnabledPropertyValue,
  GitPublicLinkbackMessagesEnabledPropertyValueWithMetadata,
  GuestPropertyValue,
  GuestPropertyValueWithMetadata,
  HasAssignee,
  HasAssigneeOutgoingLinkAndTarget,
  HasAssigneeOutgoingLinksByLinkEntityTypeId,
  HasAssigneeProperties,
  HasAssigneePropertiesWithMetadata,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasCreatorPropertiesWithMetadata,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  HasSubscriberPropertiesWithMetadata,
  IdentifierPropertyValue,
  IdentifierPropertyValueWithMetadata,
  IDPropertyValue,
  IDPropertyValueWithMetadata,
  IntegrationSourceTypePropertyValue,
  IntegrationSourceTypePropertyValueWithMetadata,
  InviteHashPropertyValue,
  InviteHashPropertyValueWithMetadata,
  IsMePropertyValue,
  IsMePropertyValueWithMetadata,
  Issue,
  IssueHasAssigneeLink,
  IssueHasCreatorLink,
  IssueHasSubscriberLink,
  IssueNumberPropertyValue,
  IssueNumberPropertyValueWithMetadata,
  IssueOutgoingLinkAndTarget,
  IssueOutgoingLinksByLinkEntityTypeId,
  IssueParentLink,
  IssueProperties,
  IssuePropertiesWithMetadata,
  IssueSnoozedByLink,
  IssueStateLink,
  IssueURLPropertyValue,
  IssueURLPropertyValueWithMetadata,
  LastSeenPropertyValue,
  LastSeenPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LogoURLPropertyValue,
  LogoURLPropertyValueWithMetadata,
  MarkdownDescriptionPropertyValue,
  MarkdownDescriptionPropertyValueWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  Organization,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OrganizationPropertiesWithMetadata,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  ParentPropertiesWithMetadata,
  PeriodUploadVolumePropertyValue,
  PeriodUploadVolumePropertyValueWithMetadata,
  PreviousIdentifierPropertyValue,
  PreviousIdentifierPropertyValueWithMetadata,
  PreviousURLKeysPropertyValue,
  PreviousURLKeysPropertyValueWithMetadata,
  PriorityLabelPropertyValue,
  PriorityLabelPropertyValueWithMetadata,
  PriorityPropertyValue,
  PriorityPropertyValueWithMetadata,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ProjectUpdateRemindersHourPropertyValue,
  ProjectUpdateRemindersHourPropertyValueWithMetadata,
  RoadmapEnabledPropertyValue,
  RoadmapEnabledPropertyValueWithMetadata,
  SAMLEnabledPropertyValue,
  SAMLEnabledPropertyValueWithMetadata,
  SCIMEnabledPropertyValue,
  SCIMEnabledPropertyValueWithMetadata,
  SnoozedBy,
  SnoozedByOutgoingLinkAndTarget,
  SnoozedByOutgoingLinksByLinkEntityTypeId,
  SnoozedByProperties,
  SnoozedByPropertiesWithMetadata,
  SnoozedUntilAtPropertyValue,
  SnoozedUntilAtPropertyValueWithMetadata,
  SortOrderPropertyValue,
  SortOrderPropertyValueWithMetadata,
  StartedAtPropertyValue,
  StartedAtPropertyValueWithMetadata,
  StartedTriageAtPropertyValue,
  StartedTriageAtPropertyValueWithMetadata,
  State,
  StateOutgoingLinkAndTarget,
  StateOutgoingLinksByLinkEntityTypeId,
  StateProperties,
  StatePropertiesWithMetadata,
  StatusEmojiPropertyValue,
  StatusEmojiPropertyValueWithMetadata,
  StatusLabelPropertyValue,
  StatusLabelPropertyValueWithMetadata,
  StatusUntilAtPropertyValue,
  StatusUntilAtPropertyValueWithMetadata,
  SubIssueSortOrderPropertyValue,
  SubIssueSortOrderPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimezonePropertyValue,
  TimezonePropertyValueWithMetadata,
  Title1PropertyValue,
  TitlePropertyValueWithMetadata1,
  TrashedPropertyValue,
  TrashedPropertyValueWithMetadata,
  TriagedAtPropertyValue,
  TriagedAtPropertyValueWithMetadata,
  TrialEndsAtPropertyValue,
  TrialEndsAtPropertyValueWithMetadata,
  UpdatedAtPropertyValue,
  UpdatedAtPropertyValueWithMetadata,
  URLKeyPropertyValue,
  URLKeyPropertyValueWithMetadata,
  User,
  UserBelongsToOrganizationLink,
  UserCountPropertyValue,
  UserCountPropertyValueWithMetadata,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserPropertiesWithMetadata,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
  WorkflowStatePropertiesWithMetadata,
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

export type AttachmentPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/title/"?: TitlePropertyValueWithMetadata0;
    "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/attachment-url/": AttachmentURLPropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/created-at/"?: CreatedAtPropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/group-by-source/": GroupBySourcePropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/id/": IDPropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/metadata/": MetadataPropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/source-type/"?: SourceTypePropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/source/"?: SourcePropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/subtitle/"?: SubtitlePropertyValueWithMetadata;
    "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValueWithMetadata;
  };
};

/**
 * Location of the attachment which is also used as an identifier.
 */
export type AttachmentURLPropertyValue = TextDataType;

export type AttachmentURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type BelongsToIssue = LinkEntity<BelongsToIssueProperties>;

export type BelongsToIssueOutgoingLinkAndTarget = never;

export type BelongsToIssueOutgoingLinksByLinkEntityTypeId = {};

/**
 * The issue this attachment belongs to.
 */
export type BelongsToIssueProperties = BelongsToIssueProperties1 &
  BelongsToIssueProperties2;
export type BelongsToIssueProperties1 = LinkProperties;

export type BelongsToIssueProperties2 = {};

export type BelongsToIssuePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Indicates if attachments for the same source application should be grouped in the Linear UI.
 */
export type GroupBySourcePropertyValue = BooleanDataType;

export type GroupBySourcePropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Custom metadata related to the attachment.
 */
export type MetadataPropertyValue = ObjectDataType;

export type MetadataPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type ObjectDataTypeWithMetadata = {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
};
export type ObjectDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
};

/**
 * Information about the source which created the attachment.
 */
export type SourcePropertyValue = ObjectDataType;

export type SourcePropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * An accessor helper to source.type, defines the source type of the attachment.
 */
export type SourceTypePropertyValue = TextDataType;

export type SourceTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Content for the subtitle line in the Linear attachment widget.
 */
export type SubtitlePropertyValue = TextDataType;

export type SubtitlePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The title of something.
 */
export type Title0PropertyValue = TextDataType;

export type TitlePropertyValueWithMetadata0 = TextDataTypeWithMetadata;
