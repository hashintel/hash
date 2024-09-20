/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ArrayMetadata,
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

/**
 * Whether the user account is active or disabled (suspended).
 */
export type ActivePropertyValue = BooleanDataType;

export type ActivePropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 *  Whether the user is an organization administrator.
 */
export type AdminPropertyValue = BooleanDataType;

export type AdminPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * Whether member users are allowed to send invites.
 */
export type AllowMembersToInvitePropertyValue = BooleanDataType;

export type AllowMembersToInvitePropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Allowed authentication provider, empty array means all are allowed.
 */
export type AllowedAuthServicePropertyValue = TextDataType;

export type AllowedAuthServicePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The time at which the entity was archived. Null if the entity has not been archived.
 */
export type ArchivedAtPropertyValue = TextDataType;

export type ArchivedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the issue was automatically archived by the auto pruning process.
 */
export type AutoArchivedAtPropertyValue = TextDataType;

export type AutoArchivedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the issue was automatically closed by the auto pruning process.
 */
export type AutoClosedAtPropertyValue = TextDataType;

export type AutoClosedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An URL to the user's avatar image.
 */
export type AvatarURLPropertyValue = TextDataType;

export type AvatarURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The organization the user belongs to.
 */
export type BelongsToOrganization = {
  entityTypeIds: [
    "https://hash.ai/@linear/types/entity-type/belongs-to-organization/v/1",
  ];
  properties: BelongsToOrganizationProperties;
  propertiesWithMetadata: BelongsToOrganizationPropertiesWithMetadata;
};

export type BelongsToOrganizationOutgoingLinkAndTarget = never;

export type BelongsToOrganizationOutgoingLinksByLinkEntityTypeId = {};

/**
 * The organization the user belongs to.
 */
export type BelongsToOrganizationProperties = BelongsToOrganizationProperties1 &
  BelongsToOrganizationProperties2;
export type BelongsToOrganizationProperties1 = LinkProperties;

export type BelongsToOrganizationProperties2 = {};

export type BelongsToOrganizationPropertiesWithMetadata =
  BelongsToOrganizationPropertiesWithMetadata1 &
    BelongsToOrganizationPropertiesWithMetadata2;
export type BelongsToOrganizationPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export type BelongsToOrganizationPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type BooleanDataTypeWithMetadata = {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
};
export type BooleanDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
};

/**
 * Suggested branch name for the issue.
 */
export type BranchNamePropertyValue = TextDataType;

export type BranchNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the issue was moved into canceled state.
 */
export type CanceledAtPropertyValue = TextDataType;

export type CanceledAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the issue was moved into completed state.
 */
export type CompletedAtPropertyValue = TextDataType;

export type CompletedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the entity was created.
 */
export type CreatedAtPropertyValue = TextDataType;

export type CreatedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Number of issues created.
 */
export type CreatedIssueCountPropertyValue = NumberDataType;

export type CreatedIssueCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).
 */
export type CustomerTicketCountPropertyValue = NumberDataType;

export type CustomerTicketCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The time at which deletion of the organization was requested.
 */
export type DeletionRequestedAtPropertyValue = TextDataType;

export type DeletionRequestedAtPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type DescriptionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Reason why is the account disabled.
 */
export type DisableReasonPropertyValue = TextDataType;

export type DisableReasonPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The user's display (nick) name. Unique within each organization.
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The date at which the issue is due.
 */
export type DueDatePropertyValue = TextDataType;

export type DueDatePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

export type EmailPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The estimate of the complexity of the issue.
 */
export type EstimatePropertyValue = NumberDataType;

export type EstimatePropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The user's full name.
 */
export type FullNamePropertyValue = TextDataType;

export type FullNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * How git branches are formatted. If null, default formatting will be used.
 */
export type GitBranchFormatPropertyValue = TextDataType;

export type GitBranchFormatPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Whether the Git integration linkback messages should be sent to private repositories.
 */
export type GitLinkbackMessagesEnabledPropertyValue = BooleanDataType;

export type GitLinkbackMessagesEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether the Git integration linkback messages should be sent to public repositories.
 */
export type GitPublicLinkbackMessagesEnabledPropertyValue = BooleanDataType;

export type GitPublicLinkbackMessagesEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether the user is a guest in the workspace and limited to accessing a subset of teams.
 */
export type GuestPropertyValue = BooleanDataType;

export type GuestPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * The user to whom the issue is assigned to.
 */
export type HasAssignee = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/has-assignee/v/1"];
  properties: HasAssigneeProperties;
  propertiesWithMetadata: HasAssigneePropertiesWithMetadata;
};

export type HasAssigneeOutgoingLinkAndTarget = never;

export type HasAssigneeOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user to whom the issue is assigned to.
 */
export type HasAssigneeProperties = HasAssigneeProperties1 &
  HasAssigneeProperties2;
export type HasAssigneeProperties1 = LinkProperties;

export type HasAssigneeProperties2 = {};

export type HasAssigneePropertiesWithMetadata =
  HasAssigneePropertiesWithMetadata1 & HasAssigneePropertiesWithMetadata2;
export type HasAssigneePropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type HasAssigneePropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The user who created something.
 */
export type HasCreator = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/has-creator/v/1"];
  properties: HasCreatorProperties;
  propertiesWithMetadata: HasCreatorPropertiesWithMetadata;
};

export type HasCreatorOutgoingLinkAndTarget = never;

export type HasCreatorOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user who created something.
 */
export type HasCreatorProperties = HasCreatorProperties1 &
  HasCreatorProperties2;
export type HasCreatorProperties1 = LinkProperties;

export type HasCreatorProperties2 = {};

export type HasCreatorPropertiesWithMetadata =
  HasCreatorPropertiesWithMetadata1 & HasCreatorPropertiesWithMetadata2;
export type HasCreatorPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type HasCreatorPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A user who is subscribed to the issue.
 */
export type HasSubscriber = {
  entityTypeIds: [
    "https://hash.ai/@linear/types/entity-type/has-subscriber/v/1",
  ];
  properties: HasSubscriberProperties;
  propertiesWithMetadata: HasSubscriberPropertiesWithMetadata;
};

export type HasSubscriberOutgoingLinkAndTarget = never;

export type HasSubscriberOutgoingLinksByLinkEntityTypeId = {};

/**
 * A user who is subscribed to the issue.
 */
export type HasSubscriberProperties = HasSubscriberProperties1 &
  HasSubscriberProperties2;
export type HasSubscriberProperties1 = LinkProperties;

export type HasSubscriberProperties2 = {};

export type HasSubscriberPropertiesWithMetadata =
  HasSubscriberPropertiesWithMetadata1 & HasSubscriberPropertiesWithMetadata2;
export type HasSubscriberPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type HasSubscriberPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The unique identifier of the entity.
 */
export type IDPropertyValue = TextDataType;

export type IDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Issue's human readable identifier (e.g. ENG-123).
 */
export type IdentifierPropertyValue = TextDataType;

export type IdentifierPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Integration type that created this issue, if applicable. (e.g. slack)
 */
export type IntegrationSourceTypePropertyValue = TextDataType;

export type IntegrationSourceTypePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Unique hash for the user to be used in invite URLs.
 */
export type InviteHashPropertyValue = TextDataType;

export type InviteHashPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 *  Whether the user is the currently authenticated user.
 */
export type IsMePropertyValue = BooleanDataType;

export type IsMePropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * An issue.
 */
export type Issue = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/issue/v/1"];
  properties: IssueProperties;
  propertiesWithMetadata: IssuePropertiesWithMetadata;
};

export type IssueHasAssigneeLink = {
  linkEntity: HasAssignee;
  rightEntity: User;
};

export type IssueHasCreatorLink = { linkEntity: HasCreator; rightEntity: User };

export type IssueHasSubscriberLink = {
  linkEntity: HasSubscriber;
  rightEntity: User;
};

/**
 * The issue's unique number.
 */
export type IssueNumberPropertyValue = NumberDataType;

export type IssueNumberPropertyValueWithMetadata = NumberDataTypeWithMetadata;

export type IssueOutgoingLinkAndTarget =
  | IssueHasAssigneeLink
  | IssueHasCreatorLink
  | IssueHasSubscriberLink
  | IssueParentLink
  | IssueSnoozedByLink
  | IssueStateLink;

export type IssueOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/has-assignee/v/1": IssueHasAssigneeLink;
  "https://hash.ai/@linear/types/entity-type/has-creator/v/1": IssueHasCreatorLink;
  "https://hash.ai/@linear/types/entity-type/has-subscriber/v/1": IssueHasSubscriberLink;
  "https://hash.ai/@linear/types/entity-type/parent/v/1": IssueParentLink;
  "https://hash.ai/@linear/types/entity-type/snoozed-by/v/1": IssueSnoozedByLink;
  "https://hash.ai/@linear/types/entity-type/state/v/1": IssueStateLink;
};

export type IssueParentLink = { linkEntity: Parent; rightEntity: Issue };

/**
 * An issue.
 */
export type IssueProperties = {
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
};

export type IssuePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
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
  };
};

export type IssueSnoozedByLink = { linkEntity: SnoozedBy; rightEntity: User };

export type IssueStateLink = { linkEntity: State; rightEntity: WorkflowState };

/**
 * The URL of the issue.
 */
export type IssueURLPropertyValue = TextDataType;

export type IssueURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The last time the user was seen online. If null, the user is currently online.
 */
export type LastSeenPropertyValue = TextDataType;

export type LastSeenPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * undefined
 */
export type Link = {
  entityTypeIds: [
    "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
  ];
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
};

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

export type LinkPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The organization's logo URL.
 */
export type LogoURLPropertyValue = TextDataType;

export type LogoURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The issue's description in markdown format.
 */
export type MarkdownDescriptionPropertyValue = TextDataType;

export type MarkdownDescriptionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The organization's name.
 */
export type NamePropertyValue = TextDataType;

export type NamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export type NumberDataTypeWithMetadata = {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
};
export type NumberDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
};

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type Organization = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/organization/v/1"];
  properties: OrganizationProperties;
  propertiesWithMetadata: OrganizationPropertiesWithMetadata;
};

export type OrganizationOutgoingLinkAndTarget = never;

export type OrganizationOutgoingLinksByLinkEntityTypeId = {};

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type OrganizationProperties = {
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
};

export type OrganizationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
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
  };
};

/**
 * The parent of the issue.
 */
export type Parent = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/parent/v/1"];
  properties: ParentProperties;
  propertiesWithMetadata: ParentPropertiesWithMetadata;
};

export type ParentOutgoingLinkAndTarget = never;

export type ParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent of the issue.
 */
export type ParentProperties = ParentProperties1 & ParentProperties2;
export type ParentProperties1 = LinkProperties;

export type ParentProperties2 = {};

export type ParentPropertiesWithMetadata = ParentPropertiesWithMetadata1 &
  ParentPropertiesWithMetadata2;
export type ParentPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type ParentPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Rolling 30-day total upload volume for the organization, in megabytes.
 */
export type PeriodUploadVolumePropertyValue = NumberDataType;

export type PeriodUploadVolumePropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Previous identifier of the issue if it has been moved between teams.
 */
export type PreviousIdentifierPropertyValue = TextDataType;

export type PreviousIdentifierPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Previously used URL keys for the organization (last 3 are kept and redirected).
 */
export type PreviousURLKeysPropertyValue = TextDataType;

export type PreviousURLKeysPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Label for the priority.
 */
export type PriorityLabelPropertyValue = TextDataType;

export type PriorityLabelPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
 */
export type PriorityPropertyValue = NumberDataType;

export type PriorityPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * User's profile URL.
 */
export type ProfileURLPropertyValue = TextDataType;

export type ProfileURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The hour at which to prompt for project updates.
 */
export type ProjectUpdateRemindersHourPropertyValue = NumberDataType;

export type ProjectUpdateRemindersHourPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * Whether the organization is using a roadmap.
 */
export type RoadmapEnabledPropertyValue = BooleanDataType;

export type RoadmapEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether SAML authentication is enabled for organization.
 */
export type SAMLEnabledPropertyValue = BooleanDataType;

export type SAMLEnabledPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * Whether SCIM provisioning is enabled for organization.
 */
export type SCIMEnabledPropertyValue = BooleanDataType;

export type SCIMEnabledPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * The user who snoozed the issue.
 */
export type SnoozedBy = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/snoozed-by/v/1"];
  properties: SnoozedByProperties;
  propertiesWithMetadata: SnoozedByPropertiesWithMetadata;
};

export type SnoozedByOutgoingLinkAndTarget = never;

export type SnoozedByOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user who snoozed the issue.
 */
export type SnoozedByProperties = SnoozedByProperties1 & SnoozedByProperties2;
export type SnoozedByProperties1 = LinkProperties;

export type SnoozedByProperties2 = {};

export type SnoozedByPropertiesWithMetadata = SnoozedByPropertiesWithMetadata1 &
  SnoozedByPropertiesWithMetadata2;
export type SnoozedByPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type SnoozedByPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The time until an issue will be snoozed in Triage view.
 */
export type SnoozedUntilAtPropertyValue = TextDataType;

export type SnoozedUntilAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The order of the item in relation to other items in the organization.
 */
export type SortOrderPropertyValue = NumberDataType;

export type SortOrderPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The time at which the issue was moved into started state.
 */
export type StartedAtPropertyValue = TextDataType;

export type StartedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the issue entered triage.
 */
export type StartedTriageAtPropertyValue = TextDataType;

export type StartedTriageAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The workflow state that the issue is associated with.
 */
export type State = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/state/v/1"];
  properties: StateProperties;
  propertiesWithMetadata: StatePropertiesWithMetadata;
};

export type StateOutgoingLinkAndTarget = never;

export type StateOutgoingLinksByLinkEntityTypeId = {};

/**
 * The workflow state that the issue is associated with.
 */
export type StateProperties = StateProperties1 & StateProperties2;
export type StateProperties1 = LinkProperties;

export type StateProperties2 = {};

export type StatePropertiesWithMetadata = StatePropertiesWithMetadata1 &
  StatePropertiesWithMetadata2;
export type StatePropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type StatePropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The emoji to represent the user current status.
 */
export type StatusEmojiPropertyValue = TextDataType;

export type StatusEmojiPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The label of the user current status.
 */
export type StatusLabelPropertyValue = TextDataType;

export type StatusLabelPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A date at which the user current status should be cleared.
 */
export type StatusUntilAtPropertyValue = TextDataType;

export type StatusUntilAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The order of the item in the sub-issue list. Only set if the issue has a parent.
 */
export type SubIssueSortOrderPropertyValue = NumberDataType;

export type SubIssueSortOrderPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

export type TextDataTypeWithMetadata = {
  value: TextDataType;
  metadata: TextDataTypeMetadata;
};
export type TextDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
};

/**
 * The local timezone of the user.
 */
export type TimezonePropertyValue = TextDataType;

export type TimezonePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The issue's title.
 */
export type Title1PropertyValue = TextDataType;

export type TitlePropertyValueWithMetadata1 = TextDataTypeWithMetadata;

/**
 * A flag that indicates whether the issue is in the trash bin.
 */
export type TrashedPropertyValue = BooleanDataType;

export type TrashedPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * The time at which the issue left triage.
 */
export type TriagedAtPropertyValue = TextDataType;

export type TriagedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The time at which the trial of the plus plan will end.
 */
export type TrialEndsAtPropertyValue = TextDataType;

export type TrialEndsAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The organization's unique URL key.
 */
export type URLKeyPropertyValue = TextDataType;

export type URLKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.
 */
export type UpdatedAtPropertyValue = TextDataType;

export type UpdatedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A user that has access to the the resources of an organization.
 */
export type User = {
  entityTypeIds: ["https://hash.ai/@linear/types/entity-type/user/v/1"];
  properties: UserProperties;
  propertiesWithMetadata: UserPropertiesWithMetadata;
};

export type UserBelongsToOrganizationLink = {
  linkEntity: BelongsToOrganization;
  rightEntity: Organization;
};

/**
 * Number of active users in the organization.
 */
export type UserCountPropertyValue = NumberDataType;

export type UserCountPropertyValueWithMetadata = NumberDataTypeWithMetadata;

export type UserOutgoingLinkAndTarget = UserBelongsToOrganizationLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/belongs-to-organization/v/1": UserBelongsToOrganizationLink;
};

/**
 * A user that has access to the the resources of an organization.
 */
export type UserProperties = {
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
};

export type UserPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
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
  };
};

/**
 * A state in a team workflow.
 */
export type WorkflowState = {
  entityTypeIds: [
    "https://hash.ai/@linear/types/entity-type/workflow-state/v/1",
  ];
  properties: WorkflowStateProperties;
  propertiesWithMetadata: WorkflowStatePropertiesWithMetadata;
};

export type WorkflowStateOutgoingLinkAndTarget = never;

export type WorkflowStateOutgoingLinksByLinkEntityTypeId = {};

/**
 * A state in a team workflow.
 */
export type WorkflowStateProperties = {};

export type WorkflowStatePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
