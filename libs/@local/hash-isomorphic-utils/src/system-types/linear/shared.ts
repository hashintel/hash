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
export type ArchivedAtPropertyValue = DateTimeDataType;

export type ArchivedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The time at which the issue was automatically archived by the auto pruning process.
 */
export type AutoArchivedAtPropertyValue = DateTimeDataType;

export type AutoArchivedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * The time at which the issue was automatically closed by the auto pruning process.
 */
export type AutoClosedAtPropertyValue = DateTimeDataType;

export type AutoClosedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * An URL to the user's avatar image.
 */
export type AvatarURLPropertyValue = URIDataType;

export type AvatarURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

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
export type BelongsToOrganizationProperties = LinkProperties & {};

export type BelongsToOrganizationPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
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
export type CanceledAtPropertyValue = DateTimeDataType;

export type CanceledAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The time at which the issue was moved into completed state.
 */
export type CompletedAtPropertyValue = DateTimeDataType;

export type CompletedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The time at which the entity was created.
 */
export type CreatedAtPropertyValue = DateTimeDataType;

export type CreatedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

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
 * A reference to a particular day represented within a calendar system, formatted according to RFC 3339.
 */
export type DateDataType = TextDataType;

export type DateDataTypeWithMetadata = {
  value: DateDataType;
  metadata: DateDataTypeMetadata;
};
export type DateDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1";
};

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = TextDataType;

export type DateTimeDataTypeWithMetadata = {
  value: DateTimeDataType;
  metadata: DateTimeDataTypeMetadata;
};
export type DateTimeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1";
};

/**
 * The time at which deletion of the organization was requested.
 */
export type DeletionRequestedAtPropertyValue = DateTimeDataType;

export type DeletionRequestedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

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
export type DueDatePropertyValue = DateDataType;

export type DueDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * An identifier for an email box to which messages are delivered.
 */
export type EmailDataType = TextDataType;

export type EmailDataTypeWithMetadata = {
  value: EmailDataType;
  metadata: EmailDataTypeMetadata;
};
export type EmailDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1";
};

/**
 * An email address
 */
export type EmailPropertyValue = EmailDataType;

export type EmailPropertyValueWithMetadata = EmailDataTypeWithMetadata;

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
export type HasAssigneeProperties = LinkProperties & {};

export type HasAssigneePropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
export type HasCreatorProperties = LinkProperties & {};

export type HasCreatorPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
export type HasSubscriberProperties = LinkProperties & {};

export type HasSubscriberPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
 * A measure of information content.
 */
export type InformationDataType = NumberDataType;

export type InformationDataTypeWithMetadata = {
  value: InformationDataType;
  metadata: InformationDataTypeMetadata;
};
export type InformationDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/information/v/1";
};

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
  "https://hash.ai/@linear/types/property-type/title/": TitlePropertyValue;
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
    "https://hash.ai/@linear/types/property-type/title/": TitlePropertyValueWithMetadata;
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
export type IssueURLPropertyValue = URIDataType;

export type IssueURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The last time the user was seen online. If null, the user is currently online.
 */
export type LastSeenPropertyValue = DateTimeDataType;

export type LastSeenPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

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
export type LogoURLPropertyValue = URIDataType;

export type LogoURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The issue's description in markdown format.
 */
export type MarkdownDescriptionPropertyValue = TextDataType;

export type MarkdownDescriptionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A unit of information equal to one million bytes.
 */
export type MegabytesDataType = InformationDataType;

export type MegabytesDataTypeWithMetadata = {
  value: MegabytesDataType;
  metadata: MegabytesDataTypeMetadata;
};
export type MegabytesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/megabytes/v/1";
};

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
export type ParentProperties = LinkProperties & {};

export type ParentPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Rolling 30-day total upload volume for the organization, in megabytes.
 */
export type PeriodUploadVolumePropertyValue = MegabytesDataType;

export type PeriodUploadVolumePropertyValueWithMetadata =
  MegabytesDataTypeWithMetadata;

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
export type ProfileURLPropertyValue = URIDataType;

export type ProfileURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

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
export type SnoozedByProperties = LinkProperties & {};

export type SnoozedByPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The time until an issue will be snoozed in Triage view.
 */
export type SnoozedUntilAtPropertyValue = DateTimeDataType;

export type SnoozedUntilAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * The order of the item in relation to other items in the organization.
 */
export type SortOrderPropertyValue = NumberDataType;

export type SortOrderPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The time at which the issue was moved into started state.
 */
export type StartedAtPropertyValue = DateTimeDataType;

export type StartedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The time at which the issue entered triage.
 */
export type StartedTriageAtPropertyValue = DateTimeDataType;

export type StartedTriageAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

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
export type StateProperties = LinkProperties & {};

export type StatePropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
export type StatusUntilAtPropertyValue = DateTimeDataType;

export type StatusUntilAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

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
export type TitlePropertyValue = TextDataType;

export type TitlePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A flag that indicates whether the issue is in the trash bin.
 */
export type TrashedPropertyValue = BooleanDataType;

export type TrashedPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * The time at which the issue left triage.
 */
export type TriagedAtPropertyValue = DateTimeDataType;

export type TriagedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The time at which the trial of the plus plan will end.
 */
export type TrialEndsAtPropertyValue = DateTimeDataType;

export type TrialEndsAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * A unique identifier for a resource (e.g. a URL, or URN).
 */
export type URIDataType = TextDataType;

export type URIDataTypeWithMetadata = {
  value: URIDataType;
  metadata: URIDataTypeMetadata;
};
export type URIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1";
};

/**
 * The organization's unique URL key.
 */
export type URLKeyPropertyValue = TextDataType;

export type URLKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.
 */
export type UpdatedAtPropertyValue = DateTimeDataType;

export type UpdatedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * A user that has access to the resources of an organization.
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
 * A user that has access to the resources of an organization.
 */
export type UserProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@h/types/property-type/email/": EmailPropertyValue;
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
    "https://hash.ai/@h/types/property-type/email/": EmailPropertyValueWithMetadata;
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
