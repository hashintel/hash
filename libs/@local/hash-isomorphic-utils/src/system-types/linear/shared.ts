/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ArrayMetadata,
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type {
  Confidence,
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

/**
 * Whether the user account is active or disabled (suspended).
 */
export type ActivePropertyValue = BooleanDataType;

export interface ActivePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 *  Whether the user is an organization administrator.
 */
export type AdminPropertyValue = BooleanDataType;

export interface AdminPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether member users are allowed to send invites.
 */
export type AllowMembersToInvitePropertyValue = BooleanDataType;

export interface AllowMembersToInvitePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Allowed authentication provider, empty array means all are allowed.
 */
export type AllowedAuthServicePropertyValue = TextDataType;

export interface AllowedAuthServicePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the entity was archived. Null if the entity has not been archived.
 */
export type ArchivedAtPropertyValue = TextDataType;

export interface ArchivedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the issue was automatically archived by the auto pruning process.
 */
export type AutoArchivedAtPropertyValue = TextDataType;

export interface AutoArchivedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the issue was automatically closed by the auto pruning process.
 */
export type AutoClosedAtPropertyValue = TextDataType;

export interface AutoClosedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An URL to the user's avatar image.
 */
export type AvatarURLPropertyValue = TextDataType;

export interface AvatarURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The organization the user belongs to.
 */
export interface BelongsToOrganization extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/belongs-to-organization/v/1";
  properties: BelongsToOrganizationProperties;
  propertiesWithMetadata: BelongsToOrganizationPropertiesWithMetadata;
}

export type BelongsToOrganizationOutgoingLinkAndTarget = never;

export interface BelongsToOrganizationOutgoingLinksByLinkEntityTypeId {}

/**
 * The organization the user belongs to.
 */
export interface BelongsToOrganizationProperties
  extends BelongsToOrganizationProperties1,
    BelongsToOrganizationProperties2 {}
export interface BelongsToOrganizationProperties1 extends LinkProperties {}

export interface BelongsToOrganizationProperties2 {}

export interface BelongsToOrganizationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: BelongsToOrganizationPropertiesWithMetadataValue;
}

export interface BelongsToOrganizationPropertiesWithMetadataValue
  extends BelongsToOrganizationPropertiesWithMetadataValue1,
    BelongsToOrganizationPropertiesWithMetadataValue2 {}
export interface BelongsToOrganizationPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface BelongsToOrganizationPropertiesWithMetadataValue2 {}

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export interface BooleanDataTypeWithMetadata {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
}
export interface BooleanDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
}

/**
 * Suggested branch name for the issue.
 */
export type BranchNamePropertyValue = TextDataType;

export interface BranchNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the issue was moved into canceled state.
 */
export type CanceledAtPropertyValue = TextDataType;

export interface CanceledAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the issue was moved into completed state.
 */
export type CompletedAtPropertyValue = TextDataType;

export interface CompletedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the entity was created.
 */
export type CreatedAtPropertyValue = TextDataType;

export interface CreatedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Number of issues created.
 */
export type CreatedIssueCountPropertyValue = NumberDataType;

export interface CreatedIssueCountPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).
 */
export type CustomerTicketCountPropertyValue = NumberDataType;

export interface CustomerTicketCountPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The time at which deletion of the organization was requested.
 */
export type DeletionRequestedAtPropertyValue = TextDataType;

export interface DeletionRequestedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export interface DescriptionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Reason why is the account disabled.
 */
export type DisableReasonPropertyValue = TextDataType;

export interface DisableReasonPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The user's display (nick) name. Unique within each organization.
 */
export type DisplayNamePropertyValue = TextDataType;

export interface DisplayNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The date at which the issue is due.
 */
export type DueDatePropertyValue = TextDataType;

export interface DueDatePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

export interface EmailPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The estimate of the complexity of the issue.
 */
export type EstimatePropertyValue = NumberDataType;

export interface EstimatePropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The user's full name.
 */
export type FullNamePropertyValue = TextDataType;

export interface FullNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * How git branches are formatted. If null, default formatting will be used.
 */
export type GitBranchFormatPropertyValue = TextDataType;

export interface GitBranchFormatPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Whether the Git integration linkback messages should be sent to private repositories.
 */
export type GitLinkbackMessagesEnabledPropertyValue = BooleanDataType;

export interface GitLinkbackMessagesEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether the Git integration linkback messages should be sent to public repositories.
 */
export type GitPublicLinkbackMessagesEnabledPropertyValue = BooleanDataType;

export interface GitPublicLinkbackMessagesEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether the user is a guest in the workspace and limited to accessing a subset of teams.
 */
export type GuestPropertyValue = BooleanDataType;

export interface GuestPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * The user to whom the issue is assigned to.
 */
export interface HasAssignee extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/has-assignee/v/1";
  properties: HasAssigneeProperties;
  propertiesWithMetadata: HasAssigneePropertiesWithMetadata;
}

export type HasAssigneeOutgoingLinkAndTarget = never;

export interface HasAssigneeOutgoingLinksByLinkEntityTypeId {}

/**
 * The user to whom the issue is assigned to.
 */
export interface HasAssigneeProperties
  extends HasAssigneeProperties1,
    HasAssigneeProperties2 {}
export interface HasAssigneeProperties1 extends LinkProperties {}

export interface HasAssigneeProperties2 {}

export interface HasAssigneePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasAssigneePropertiesWithMetadataValue;
}

export interface HasAssigneePropertiesWithMetadataValue
  extends HasAssigneePropertiesWithMetadataValue1,
    HasAssigneePropertiesWithMetadataValue2 {}
export interface HasAssigneePropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasAssigneePropertiesWithMetadataValue2 {}

/**
 * The user who created something.
 */
export interface HasCreator extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/has-creator/v/1";
  properties: HasCreatorProperties;
  propertiesWithMetadata: HasCreatorPropertiesWithMetadata;
}

export type HasCreatorOutgoingLinkAndTarget = never;

export interface HasCreatorOutgoingLinksByLinkEntityTypeId {}

/**
 * The user who created something.
 */
export interface HasCreatorProperties
  extends HasCreatorProperties1,
    HasCreatorProperties2 {}
export interface HasCreatorProperties1 extends LinkProperties {}

export interface HasCreatorProperties2 {}

export interface HasCreatorPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasCreatorPropertiesWithMetadataValue;
}

export interface HasCreatorPropertiesWithMetadataValue
  extends HasCreatorPropertiesWithMetadataValue1,
    HasCreatorPropertiesWithMetadataValue2 {}
export interface HasCreatorPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasCreatorPropertiesWithMetadataValue2 {}

/**
 * A user who is subscribed to the issue.
 */
export interface HasSubscriber extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/has-subscriber/v/1";
  properties: HasSubscriberProperties;
  propertiesWithMetadata: HasSubscriberPropertiesWithMetadata;
}

export type HasSubscriberOutgoingLinkAndTarget = never;

export interface HasSubscriberOutgoingLinksByLinkEntityTypeId {}

/**
 * A user who is subscribed to the issue.
 */
export interface HasSubscriberProperties
  extends HasSubscriberProperties1,
    HasSubscriberProperties2 {}
export interface HasSubscriberProperties1 extends LinkProperties {}

export interface HasSubscriberProperties2 {}

export interface HasSubscriberPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasSubscriberPropertiesWithMetadataValue;
}

export interface HasSubscriberPropertiesWithMetadataValue
  extends HasSubscriberPropertiesWithMetadataValue1,
    HasSubscriberPropertiesWithMetadataValue2 {}
export interface HasSubscriberPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasSubscriberPropertiesWithMetadataValue2 {}

/**
 * The unique identifier of the entity.
 */
export type IDPropertyValue = TextDataType;

export interface IDPropertyValueWithMetadata extends TextDataTypeWithMetadata {}

/**
 * Issue's human readable identifier (e.g. ENG-123).
 */
export type IdentifierPropertyValue = TextDataType;

export interface IdentifierPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Integration type that created this issue, if applicable. (e.g. slack)
 */
export type IntegrationSourceTypePropertyValue = TextDataType;

export interface IntegrationSourceTypePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Unique hash for the user to be used in invite URLs.
 */
export type InviteHashPropertyValue = TextDataType;

export interface InviteHashPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 *  Whether the user is the currently authenticated user.
 */
export type IsMePropertyValue = BooleanDataType;

export interface IsMePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * An issue.
 */
export interface Issue extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/issue/v/1";
  properties: IssueProperties;
  propertiesWithMetadata: IssuePropertiesWithMetadata;
}

export interface IssueHasAssigneeLink {
  linkEntity: HasAssignee;
  rightEntity: User;
}

export interface IssueHasCreatorLink {
  linkEntity: HasCreator;
  rightEntity: User;
}

export interface IssueHasSubscriberLink {
  linkEntity: HasSubscriber;
  rightEntity: User;
}

/**
 * The issue's unique number.
 */
export type IssueNumberPropertyValue = NumberDataType;

export interface IssueNumberPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

export type IssueOutgoingLinkAndTarget =
  | IssueHasAssigneeLink
  | IssueHasCreatorLink
  | IssueHasSubscriberLink
  | IssueParentLink
  | IssueSnoozedByLink
  | IssueStateLink;

export interface IssueOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@linear/types/entity-type/has-assignee/v/1": IssueHasAssigneeLink;
  "https://hash.ai/@linear/types/entity-type/has-creator/v/1": IssueHasCreatorLink;
  "https://hash.ai/@linear/types/entity-type/has-subscriber/v/1": IssueHasSubscriberLink;
  "https://hash.ai/@linear/types/entity-type/parent/v/1": IssueParentLink;
  "https://hash.ai/@linear/types/entity-type/snoozed-by/v/1": IssueSnoozedByLink;
  "https://hash.ai/@linear/types/entity-type/state/v/1": IssueStateLink;
}

export interface IssueParentLink {
  linkEntity: Parent;
  rightEntity: Issue;
}

/**
 * An issue.
 */
export interface IssueProperties extends PropertyObject {
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/auto-archived-at/"?: AutoArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/auto-closed-at/"?: AutoClosedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/branch-name/": BranchNamePropertyValue;
  "https://hash.ai/@linear/types/property-type/canceled-at/"?: CanceledAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/completed-at/"?: CompletedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/customer-ticket-count/": CustomerTicketCountPropertyValue;
  "https://hash.ai/@linear/types/property-type/due-date/"?: DueDatePropertyValue;
  "https://hash.ai/@linear/types/property-type/estimate/"?: EstimatePropertyValue;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValue;
  "https://hash.ai/@linear/types/property-type/identifier/": IdentifierPropertyValue;
  "https://hash.ai/@linear/types/property-type/integration-source-type/"?: IntegrationSourceTypePropertyValue;
  "https://hash.ai/@linear/types/property-type/issue-number/": IssueNumberPropertyValue;
  "https://hash.ai/@linear/types/property-type/issue-url/": IssueURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/markdown-description/"?: MarkdownDescriptionPropertyValue;
  "https://hash.ai/@linear/types/property-type/previous-identifier/": PreviousIdentifierPropertyValue[];
  "https://hash.ai/@linear/types/property-type/priority-label/": PriorityLabelPropertyValue;
  "https://hash.ai/@linear/types/property-type/priority/": PriorityPropertyValue;
  "https://hash.ai/@linear/types/property-type/snoozed-until-at/"?: SnoozedUntilAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/sort-order/": SortOrderPropertyValue;
  "https://hash.ai/@linear/types/property-type/started-at/"?: StartedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/started-triage-at/"?: StartedTriageAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/sub-issue-sort-order/"?: SubIssueSortOrderPropertyValue;
  "https://hash.ai/@linear/types/property-type/title/": Title1PropertyValue;
  "https://hash.ai/@linear/types/property-type/trashed/"?: TrashedPropertyValue;
  "https://hash.ai/@linear/types/property-type/triaged-at/"?: TriagedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
}

export interface IssuePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: IssuePropertiesWithMetadataValue;
}

export interface IssuePropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/auto-archived-at/"?: AutoArchivedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/auto-closed-at/"?: AutoClosedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/branch-name/": BranchNamePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/canceled-at/"?: CanceledAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/completed-at/"?: CompletedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/customer-ticket-count/": CustomerTicketCountPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/due-date/"?: DueDatePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/estimate/"?: EstimatePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/identifier/": IdentifierPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/integration-source-type/"?: IntegrationSourceTypePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/issue-number/": IssueNumberPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/issue-url/": IssueURLPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/markdown-description/"?: MarkdownDescriptionPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/previous-identifier/": {
    value: PreviousIdentifierPropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
  "https://hash.ai/@linear/types/property-type/priority-label/": PriorityLabelPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/priority/": PriorityPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/snoozed-until-at/"?: SnoozedUntilAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/sort-order/": SortOrderPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/started-at/"?: StartedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/started-triage-at/"?: StartedTriageAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/sub-issue-sort-order/"?: SubIssueSortOrderPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/title/": TitlePropertyValueWithMetadata1;
  "https://hash.ai/@linear/types/property-type/trashed/"?: TrashedPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/triaged-at/"?: TriagedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValueWithMetadata;
}

export interface IssueSnoozedByLink {
  linkEntity: SnoozedBy;
  rightEntity: User;
}

export interface IssueStateLink {
  linkEntity: State;
  rightEntity: WorkflowState;
}

/**
 * The URL of the issue.
 */
export type IssueURLPropertyValue = TextDataType;

export interface IssueURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The last time the user was seen online. If null, the user is currently online.
 */
export type LastSeenPropertyValue = TextDataType;

export interface LastSeenPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * undefined
 */
export interface Link extends EntityProperties {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
}

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId {}

export interface LinkProperties extends PropertyObject {}

export interface LinkPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: LinkPropertiesWithMetadataValue;
}

export interface LinkPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {}

/**
 * The organization's logo URL.
 */
export type LogoURLPropertyValue = TextDataType;

export interface LogoURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The issue's description in markdown format.
 */
export type MarkdownDescriptionPropertyValue = TextDataType;

export interface MarkdownDescriptionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The organization's name.
 */
export type NamePropertyValue = TextDataType;

export interface NamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export interface NumberDataTypeWithMetadata {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
}
export interface NumberDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
}

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export interface Organization extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/organization/v/1";
  properties: OrganizationProperties;
  propertiesWithMetadata: OrganizationPropertiesWithMetadata;
}

export type OrganizationOutgoingLinkAndTarget = never;

export interface OrganizationOutgoingLinksByLinkEntityTypeId {}

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export interface OrganizationProperties extends PropertyObject {
  "https://hash.ai/@linear/types/property-type/allow-members-to-invite/"?: AllowMembersToInvitePropertyValue;
  "https://hash.ai/@linear/types/property-type/allowed-auth-service/": AllowedAuthServicePropertyValue[];
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-issue-count/": CreatedIssueCountPropertyValue;
  "https://hash.ai/@linear/types/property-type/deletion-requested-at/"?: DeletionRequestedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/git-branch-format/"?: GitBranchFormatPropertyValue;
  "https://hash.ai/@linear/types/property-type/git-linkback-messages-enabled/": GitLinkbackMessagesEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/git-public-linkback-messages-enabled/": GitPublicLinkbackMessagesEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValue;
  "https://hash.ai/@linear/types/property-type/logo-url/"?: LogoURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@linear/types/property-type/period-upload-volume/": PeriodUploadVolumePropertyValue;
  "https://hash.ai/@linear/types/property-type/previous-url-keys/": PreviousURLKeysPropertyValue[];
  "https://hash.ai/@linear/types/property-type/project-update-reminders-hour/": ProjectUpdateRemindersHourPropertyValue;
  "https://hash.ai/@linear/types/property-type/roadmap-enabled/": RoadmapEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/saml-enabled/": SAMLEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/scim-enabled/": SCIMEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/trial-ends-at/"?: TrialEndsAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/url-key/": URLKeyPropertyValue;
  "https://hash.ai/@linear/types/property-type/user-count/": UserCountPropertyValue;
}

export interface OrganizationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: OrganizationPropertiesWithMetadataValue;
}

export interface OrganizationPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://hash.ai/@linear/types/property-type/allow-members-to-invite/"?: AllowMembersToInvitePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/allowed-auth-service/": {
    value: AllowedAuthServicePropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/created-issue-count/": CreatedIssueCountPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/deletion-requested-at/"?: DeletionRequestedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/git-branch-format/"?: GitBranchFormatPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/git-linkback-messages-enabled/": GitLinkbackMessagesEnabledPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/git-public-linkback-messages-enabled/": GitPublicLinkbackMessagesEnabledPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/logo-url/"?: LogoURLPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/name/": NamePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/period-upload-volume/": PeriodUploadVolumePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/previous-url-keys/": {
    value: PreviousURLKeysPropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
  "https://hash.ai/@linear/types/property-type/project-update-reminders-hour/": ProjectUpdateRemindersHourPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/roadmap-enabled/": RoadmapEnabledPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/saml-enabled/": SAMLEnabledPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/scim-enabled/": SCIMEnabledPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/trial-ends-at/"?: TrialEndsAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/url-key/": URLKeyPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/user-count/": UserCountPropertyValueWithMetadata;
}

/**
 * The parent of the issue.
 */
export interface Parent extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/parent/v/1";
  properties: ParentProperties;
  propertiesWithMetadata: ParentPropertiesWithMetadata;
}

export type ParentOutgoingLinkAndTarget = never;

export interface ParentOutgoingLinksByLinkEntityTypeId {}

/**
 * The parent of the issue.
 */
export interface ParentProperties
  extends ParentProperties1,
    ParentProperties2 {}
export interface ParentProperties1 extends LinkProperties {}

export interface ParentProperties2 {}

export interface ParentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ParentPropertiesWithMetadataValue;
}

export interface ParentPropertiesWithMetadataValue
  extends ParentPropertiesWithMetadataValue1,
    ParentPropertiesWithMetadataValue2 {}
export interface ParentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface ParentPropertiesWithMetadataValue2 {}

/**
 * Rolling 30-day total upload volume for the organization, in megabytes.
 */
export type PeriodUploadVolumePropertyValue = NumberDataType;

export interface PeriodUploadVolumePropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * Previous identifier of the issue if it has been moved between teams.
 */
export type PreviousIdentifierPropertyValue = TextDataType;

export interface PreviousIdentifierPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Previously used URL keys for the organization (last 3 are kept and redirected).
 */
export type PreviousURLKeysPropertyValue = TextDataType;

export interface PreviousURLKeysPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Label for the priority.
 */
export type PriorityLabelPropertyValue = TextDataType;

export interface PriorityLabelPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
 */
export type PriorityPropertyValue = NumberDataType;

export interface PriorityPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * User's profile URL.
 */
export type ProfileURLPropertyValue = TextDataType;

export interface ProfileURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The hour at which to prompt for project updates.
 */
export type ProjectUpdateRemindersHourPropertyValue = NumberDataType;

export interface ProjectUpdateRemindersHourPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * Whether the organization is using a roadmap.
 */
export type RoadmapEnabledPropertyValue = BooleanDataType;

export interface RoadmapEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether SAML authentication is enabled for organization.
 */
export type SAMLEnabledPropertyValue = BooleanDataType;

export interface SAMLEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether SCIM provisioning is enabled for organization.
 */
export type SCIMEnabledPropertyValue = BooleanDataType;

export interface SCIMEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * The user who snoozed the issue.
 */
export interface SnoozedBy extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/snoozed-by/v/1";
  properties: SnoozedByProperties;
  propertiesWithMetadata: SnoozedByPropertiesWithMetadata;
}

export type SnoozedByOutgoingLinkAndTarget = never;

export interface SnoozedByOutgoingLinksByLinkEntityTypeId {}

/**
 * The user who snoozed the issue.
 */
export interface SnoozedByProperties
  extends SnoozedByProperties1,
    SnoozedByProperties2 {}
export interface SnoozedByProperties1 extends LinkProperties {}

export interface SnoozedByProperties2 {}

export interface SnoozedByPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: SnoozedByPropertiesWithMetadataValue;
}

export interface SnoozedByPropertiesWithMetadataValue
  extends SnoozedByPropertiesWithMetadataValue1,
    SnoozedByPropertiesWithMetadataValue2 {}
export interface SnoozedByPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface SnoozedByPropertiesWithMetadataValue2 {}

/**
 * The time until an issue will be snoozed in Triage view.
 */
export type SnoozedUntilAtPropertyValue = TextDataType;

export interface SnoozedUntilAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The order of the item in relation to other items in the organization.
 */
export type SortOrderPropertyValue = NumberDataType;

export interface SortOrderPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The time at which the issue was moved into started state.
 */
export type StartedAtPropertyValue = TextDataType;

export interface StartedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the issue entered triage.
 */
export type StartedTriageAtPropertyValue = TextDataType;

export interface StartedTriageAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The workflow state that the issue is associated with.
 */
export interface State extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/state/v/1";
  properties: StateProperties;
  propertiesWithMetadata: StatePropertiesWithMetadata;
}

export type StateOutgoingLinkAndTarget = never;

export interface StateOutgoingLinksByLinkEntityTypeId {}

/**
 * The workflow state that the issue is associated with.
 */
export interface StateProperties extends StateProperties1, StateProperties2 {}
export interface StateProperties1 extends LinkProperties {}

export interface StateProperties2 {}

export interface StatePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: StatePropertiesWithMetadataValue;
}

export interface StatePropertiesWithMetadataValue
  extends StatePropertiesWithMetadataValue1,
    StatePropertiesWithMetadataValue2 {}
export interface StatePropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface StatePropertiesWithMetadataValue2 {}

/**
 * The emoji to represent the user current status.
 */
export type StatusEmojiPropertyValue = TextDataType;

export interface StatusEmojiPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The label of the user current status.
 */
export type StatusLabelPropertyValue = TextDataType;

export interface StatusLabelPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A date at which the user current status should be cleared.
 */
export type StatusUntilAtPropertyValue = TextDataType;

export interface StatusUntilAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The order of the item in the sub-issue list. Only set if the issue has a parent.
 */
export type SubIssueSortOrderPropertyValue = NumberDataType;

export interface SubIssueSortOrderPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

export interface TextDataTypeWithMetadata {
  value: TextDataType;
  metadata: TextDataTypeMetadata;
}
export interface TextDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
}

/**
 * The local timezone of the user.
 */
export type TimezonePropertyValue = TextDataType;

export interface TimezonePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The issue's title.
 */
export type Title1PropertyValue = TextDataType;

export interface TitlePropertyValueWithMetadata1
  extends TextDataTypeWithMetadata {}

/**
 * A flag that indicates whether the issue is in the trash bin.
 */
export type TrashedPropertyValue = BooleanDataType;

export interface TrashedPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * The time at which the issue left triage.
 */
export type TriagedAtPropertyValue = TextDataType;

export interface TriagedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The time at which the trial of the plus plan will end.
 */
export type TrialEndsAtPropertyValue = TextDataType;

export interface TrialEndsAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The organization's unique URL key.
 */
export type URLKeyPropertyValue = TextDataType;

export interface URLKeyPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.
 */
export type UpdatedAtPropertyValue = TextDataType;

export interface UpdatedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A user that has access to the the resources of an organization.
 */
export interface User extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/user/v/1";
  properties: UserProperties;
  propertiesWithMetadata: UserPropertiesWithMetadata;
}

export interface UserBelongsToOrganizationLink {
  linkEntity: BelongsToOrganization;
  rightEntity: Organization;
}

/**
 * Number of active users in the organization.
 */
export type UserCountPropertyValue = NumberDataType;

export interface UserCountPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

export type UserOutgoingLinkAndTarget = UserBelongsToOrganizationLink;

export interface UserOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@linear/types/entity-type/belongs-to-organization/v/1": UserBelongsToOrganizationLink;
}

/**
 * A user that has access to the the resources of an organization.
 */
export interface UserProperties extends PropertyObject {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValue;
  "https://hash.ai/@linear/types/property-type/active/": ActivePropertyValue;
  "https://hash.ai/@linear/types/property-type/admin/": AdminPropertyValue;
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/avatar-url/"?: AvatarURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-issue-count/": CreatedIssueCountPropertyValue;
  "https://hash.ai/@linear/types/property-type/disable-reason/"?: DisableReasonPropertyValue;
  "https://hash.ai/@linear/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@linear/types/property-type/full-name/": FullNamePropertyValue;
  "https://hash.ai/@linear/types/property-type/guest/": GuestPropertyValue;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValue;
  "https://hash.ai/@linear/types/property-type/invite-hash/": InviteHashPropertyValue;
  "https://hash.ai/@linear/types/property-type/is-me/": IsMePropertyValue;
  "https://hash.ai/@linear/types/property-type/last-seen/"?: LastSeenPropertyValue;
  "https://hash.ai/@linear/types/property-type/profile-url/": ProfileURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/status-emoji/"?: StatusEmojiPropertyValue;
  "https://hash.ai/@linear/types/property-type/status-label/"?: StatusLabelPropertyValue;
  "https://hash.ai/@linear/types/property-type/status-until-at/"?: StatusUntilAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/timezone/"?: TimezonePropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
}

export interface UserPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: UserPropertiesWithMetadataValue;
}

export interface UserPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/active/": ActivePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/admin/": AdminPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/avatar-url/"?: AvatarURLPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/created-issue-count/": CreatedIssueCountPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/disable-reason/"?: DisableReasonPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/full-name/": FullNamePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/guest/": GuestPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/invite-hash/": InviteHashPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/is-me/": IsMePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/last-seen/"?: LastSeenPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/profile-url/": ProfileURLPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/status-emoji/"?: StatusEmojiPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/status-label/"?: StatusLabelPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/status-until-at/"?: StatusUntilAtPropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/timezone/"?: TimezonePropertyValueWithMetadata;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValueWithMetadata;
}

/**
 * A state in a team workflow.
 */
export interface WorkflowState extends EntityProperties {
  entityTypeId: "https://hash.ai/@linear/types/entity-type/workflow-state/v/1";
  properties: WorkflowStateProperties;
  propertiesWithMetadata: WorkflowStatePropertiesWithMetadata;
}

export type WorkflowStateOutgoingLinkAndTarget = never;

export interface WorkflowStateOutgoingLinksByLinkEntityTypeId {}

/**
 * A state in a team workflow.
 */
export interface WorkflowStateProperties extends PropertyObject {}

export interface WorkflowStatePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: WorkflowStatePropertiesWithMetadataValue;
}

export interface WorkflowStatePropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {}
