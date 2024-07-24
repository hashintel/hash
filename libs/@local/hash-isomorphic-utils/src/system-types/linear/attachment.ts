/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type {
  Confidence,
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

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
  BelongsToOrganizationPropertiesWithMetadataValue,
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
  HasAssigneePropertiesWithMetadataValue,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasCreatorPropertiesWithMetadata,
  HasCreatorPropertiesWithMetadataValue,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  HasSubscriberPropertiesWithMetadata,
  HasSubscriberPropertiesWithMetadataValue,
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
  IssuePropertiesWithMetadataValue,
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
  LinkPropertiesWithMetadataValue,
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
  OrganizationPropertiesWithMetadataValue,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  ParentPropertiesWithMetadata,
  ParentPropertiesWithMetadataValue,
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
  SnoozedByPropertiesWithMetadataValue,
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
  StatePropertiesWithMetadataValue,
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
  UserPropertiesWithMetadataValue,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
  WorkflowStatePropertiesWithMetadata,
  WorkflowStatePropertiesWithMetadataValue,
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
  BelongsToOrganizationPropertiesWithMetadataValue,
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
  HasAssigneePropertiesWithMetadataValue,
  HasCreator,
  HasCreatorOutgoingLinkAndTarget,
  HasCreatorOutgoingLinksByLinkEntityTypeId,
  HasCreatorProperties,
  HasCreatorPropertiesWithMetadata,
  HasCreatorPropertiesWithMetadataValue,
  HasSubscriber,
  HasSubscriberOutgoingLinkAndTarget,
  HasSubscriberOutgoingLinksByLinkEntityTypeId,
  HasSubscriberProperties,
  HasSubscriberPropertiesWithMetadata,
  HasSubscriberPropertiesWithMetadataValue,
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
  IssuePropertiesWithMetadataValue,
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
  LinkPropertiesWithMetadataValue,
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
  OrganizationPropertiesWithMetadataValue,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  ParentPropertiesWithMetadata,
  ParentPropertiesWithMetadataValue,
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
  SnoozedByPropertiesWithMetadataValue,
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
  StatePropertiesWithMetadataValue,
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
  UserPropertiesWithMetadataValue,
  WorkflowState,
  WorkflowStateOutgoingLinkAndTarget,
  WorkflowStateOutgoingLinksByLinkEntityTypeId,
  WorkflowStateProperties,
  WorkflowStatePropertiesWithMetadata,
  WorkflowStatePropertiesWithMetadataValue,
};

/**
 * Issue attachment (e.g. support ticket, pull request).
 */
export interface Attachment extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/attachment/v/1";
  properties: AttachmentProperties;
  propertiesWithMetadata: AttachmentPropertiesWithMetadata;
}

export interface AttachmentBelongsToIssueLink {
  linkEntity: BelongsToIssue;
  rightEntity: Issue;
}

export interface AttachmentHasCreatorLink {
  linkEntity: HasCreator;
  rightEntity: User;
}

export type AttachmentOutgoingLinkAndTarget =
  | AttachmentBelongsToIssueLink
  | AttachmentHasCreatorLink;

export interface AttachmentOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@linear/types/entity-type/belongs-to-issue/v/1": AttachmentBelongsToIssueLink;
  "https://hash.ai/@linear/types/entity-type/has-creator/v/1": AttachmentHasCreatorLink;
}

/**
 * Issue attachment (e.g. support ticket, pull request).
 */
export interface AttachmentProperties extends PropertyObject {
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
}

export interface AttachmentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: AttachmentPropertiesWithMetadataValue;
}

export interface AttachmentPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
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
}

/**
 * Location of the attachment which is also used as an identifier.
 */
export type AttachmentURLPropertyValue = TextDataType;

export interface AttachmentURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The issue this attachment belongs to.
 */
export interface BelongsToIssue extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/belongs-to-issue/v/1";
  properties: BelongsToIssueProperties;
  propertiesWithMetadata: BelongsToIssuePropertiesWithMetadata;
}

export type BelongsToIssueOutgoingLinkAndTarget = never;

export interface BelongsToIssueOutgoingLinksByLinkEntityTypeId {}

/**
 * The issue this attachment belongs to.
 */
export interface BelongsToIssueProperties
  extends BelongsToIssueProperties1,
    BelongsToIssueProperties2 {}
export interface BelongsToIssueProperties1 extends LinkProperties {}

export interface BelongsToIssueProperties2 {}

export interface BelongsToIssuePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: BelongsToIssuePropertiesWithMetadataValue;
}

export interface BelongsToIssuePropertiesWithMetadataValue
  extends BelongsToIssuePropertiesWithMetadataValue1,
    BelongsToIssuePropertiesWithMetadataValue2 {}
export interface BelongsToIssuePropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface BelongsToIssuePropertiesWithMetadataValue2 {}

/**
 * Indicates if attachments for the same source application should be grouped in the Linear UI.
 */
export type GroupBySourcePropertyValue = BooleanDataType;

export interface GroupBySourcePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Custom metadata related to the attachment.
 */
export type MetadataPropertyValue = ObjectDataType;

export interface MetadataPropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}

/**
 * An opaque, untyped JSON object
 */
export interface ObjectDataType {}

export interface ObjectDataTypeWithMetadata {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
}
export interface ObjectDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
}

/**
 * Information about the source which created the attachment.
 */
export type SourcePropertyValue = ObjectDataType;

export interface SourcePropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}

/**
 * An accessor helper to source.type, defines the source type of the attachment.
 */
export type SourceTypePropertyValue = TextDataType;

export interface SourceTypePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Content for the subtitle line in the Linear attachment widget.
 */
export type SubtitlePropertyValue = TextDataType;

export interface SubtitlePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The title of something.
 */
export type Title0PropertyValue = TextDataType;

export interface TitlePropertyValueWithMetadata0
  extends TextDataTypeWithMetadata {}
