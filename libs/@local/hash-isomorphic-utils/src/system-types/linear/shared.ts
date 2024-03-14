/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@blockprotocol/graph";

/**
 * Whether the user account is active or disabled (suspended).
 */
export type ActivePropertyValue = BooleanDataType;

/**
 *  Whether the user is an organization administrator.
 */
export type AdminPropertyValue = BooleanDataType;

/**
 * Whether member users are allowed to send invites.
 */
export type AllowMembersToInvitePropertyValue = BooleanDataType;

/**
 * Allowed authentication provider, empty array means all are allowed.
 */
export type AllowedAuthServicePropertyValue = TextDataType;

/**
 * The time at which the entity was archived. Null if the entity has not been archived.
 */
export type ArchivedAtPropertyValue = TextDataType;

/**
 * The time at which the issue was automatically archived by the auto pruning process.
 */
export type AutoArchivedAtPropertyValue = TextDataType;

/**
 * The time at which the issue was automatically closed by the auto pruning process.
 */
export type AutoClosedAtPropertyValue = TextDataType;

/**
 * An URL to the user's avatar image.
 */
export type AvatarURLPropertyValue = TextDataType;

export type BelongsToOrganization = Entity<BelongsToOrganizationProperties> & {
  linkData: LinkData;
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

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

/**
 * Suggested branch name for the issue.
 */
export type BranchNamePropertyValue = TextDataType;

/**
 * The time at which the issue was moved into canceled state.
 */
export type CanceledAtPropertyValue = TextDataType;

/**
 * The time at which the issue was moved into completed state.
 */
export type CompletedAtPropertyValue = TextDataType;

/**
 * The time at which the entity was created.
 */
export type CreatedAtPropertyValue = TextDataType;

/**
 * Number of issues created.
 */
export type CreatedIssueCountPropertyValue = NumberDataType;

/**
 * Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).
 */
export type CustomerTicketCountPropertyValue = NumberDataType;

/**
 * The time at which deletion of the organization was requested.
 */
export type DeletionRequestedAtPropertyValue = TextDataType;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

/**
 * Reason why is the account disabled.
 */
export type DisableReasonPropertyValue = TextDataType;

/**
 * The user's display (nick) name. Unique within each organization.
 */
export type DisplayNamePropertyValue = TextDataType;

/**
 * The date at which the issue is due.
 */
export type DueDatePropertyValue = TextDataType;

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

/**
 * The estimate of the complexity of the issue.
 */
export type EstimatePropertyValue = NumberDataType;

/**
 * The user's full name.
 */
export type FullNamePropertyValue = TextDataType;

/**
 * How git branches are formatted. If null, default formatting will be used.
 */
export type GitBranchFormatPropertyValue = TextDataType;

/**
 * Whether the Git integration linkback messages should be sent to private repositories.
 */
export type GitLinkbackMessagesEnabledPropertyValue = BooleanDataType;

/**
 * Whether the Git integration linkback messages should be sent to public repositories.
 */
export type GitPublicLinkbackMessagesEnabledPropertyValue = BooleanDataType;

/**
 * Whether the user is a guest in the workspace and limited to accessing a subset of teams.
 */
export type GuestPropertyValue = BooleanDataType;

export type HasAssignee = Entity<HasAssigneeProperties> & {
  linkData: LinkData;
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

export type HasCreator = Entity<HasCreatorProperties> & { linkData: LinkData };

export type HasCreatorOutgoingLinkAndTarget = never;

export type HasCreatorOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user who created something.
 */
export type HasCreatorProperties = HasCreatorProperties1 &
  HasCreatorProperties2;
export type HasCreatorProperties1 = LinkProperties;

export type HasCreatorProperties2 = {};

export type HasSubscriber = Entity<HasSubscriberProperties> & {
  linkData: LinkData;
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

/**
 * The unique identifier of the entity.
 */
export type IDPropertyValue = TextDataType;

/**
 * Issue's human readable identifier (e.g. ENG-123).
 */
export type IdentifierPropertyValue = TextDataType;

/**
 * Integration type that created this issue, if applicable. (e.g. slack)
 */
export type IntegrationSourceTypePropertyValue = TextDataType;

/**
 * Unique hash for the user to be used in invite URLs.
 */
export type InviteHashPropertyValue = TextDataType;

/**
 *  Whether the user is the currently authenticated user.
 */
export type IsMePropertyValue = BooleanDataType;

export type Issue = Entity<IssueProperties>;

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

export type IssueSnoozedByLink = { linkEntity: SnoozedBy; rightEntity: User };

export type IssueStateLink = { linkEntity: State; rightEntity: WorkflowState };

/**
 * The URL of the issue.
 */
export type IssueURLPropertyValue = TextDataType;

/**
 * The last time the user was seen online. If null, the user is currently online.
 */
export type LastSeenPropertyValue = TextDataType;

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * The organization's logo URL.
 */
export type LogoURLPropertyValue = TextDataType;

/**
 * The issue's description in markdown format.
 */
export type MarkdownDescriptionPropertyValue = TextDataType;

/**
 * The organization's name.
 */
export type NamePropertyValue = TextDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export type Organization = Entity<OrganizationProperties>;

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

export type Parent = Entity<ParentProperties> & { linkData: LinkData };

export type ParentOutgoingLinkAndTarget = never;

export type ParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent of the issue.
 */
export type ParentProperties = ParentProperties1 & ParentProperties2;
export type ParentProperties1 = LinkProperties;

export type ParentProperties2 = {};

/**
 * Rolling 30-day total upload volume for the organization, in megabytes.
 */
export type PeriodUploadVolumePropertyValue = NumberDataType;

/**
 * Previous identifier of the issue if it has been moved between teams.
 */
export type PreviousIdentifierPropertyValue = TextDataType;

/**
 * Previously used URL keys for the organization (last 3 are kept and redirected).
 */
export type PreviousURLKeysPropertyValue = TextDataType;

/**
 * Label for the priority.
 */
export type PriorityLabelPropertyValue = TextDataType;

/**
 * The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
 */
export type PriorityPropertyValue = NumberDataType;

/**
 * User's profile URL.
 */
export type ProfileURLPropertyValue = TextDataType;

/**
 * The hour at which to prompt for project updates.
 */
export type ProjectUpdateRemindersHourPropertyValue = NumberDataType;

/**
 * Whether the organization is using a roadmap.
 */
export type RoadmapEnabledPropertyValue = BooleanDataType;

/**
 * Whether SAML authentication is enabled for organization.
 */
export type SAMLEnabledPropertyValue = BooleanDataType;

/**
 * Whether SCIM provisioning is enabled for organization.
 */
export type SCIMEnabledPropertyValue = BooleanDataType;

export type SnoozedBy = Entity<SnoozedByProperties> & { linkData: LinkData };

export type SnoozedByOutgoingLinkAndTarget = never;

export type SnoozedByOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user who snoozed the issue.
 */
export type SnoozedByProperties = SnoozedByProperties1 & SnoozedByProperties2;
export type SnoozedByProperties1 = LinkProperties;

export type SnoozedByProperties2 = {};

/**
 * The time until an issue will be snoozed in Triage view.
 */
export type SnoozedUntilAtPropertyValue = TextDataType;

/**
 * The order of the item in relation to other items in the organization.
 */
export type SortOrderPropertyValue = NumberDataType;

/**
 * The time at which the issue was moved into started state.
 */
export type StartedAtPropertyValue = TextDataType;

/**
 * The time at which the issue entered triage.
 */
export type StartedTriageAtPropertyValue = TextDataType;

export type State = Entity<StateProperties> & { linkData: LinkData };

export type StateOutgoingLinkAndTarget = never;

export type StateOutgoingLinksByLinkEntityTypeId = {};

/**
 * The workflow state that the issue is associated with.
 */
export type StateProperties = StateProperties1 & StateProperties2;
export type StateProperties1 = LinkProperties;

export type StateProperties2 = {};

/**
 * The emoji to represent the user current status.
 */
export type StatusEmojiPropertyValue = TextDataType;

/**
 * The label of the user current status.
 */
export type StatusLabelPropertyValue = TextDataType;

/**
 * A date at which the user current status should be cleared.
 */
export type StatusUntilAtPropertyValue = TextDataType;

/**
 * The order of the item in the sub-issue list. Only set if the issue has a parent.
 */
export type SubIssueSortOrderPropertyValue = NumberDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The local timezone of the user.
 */
export type TimezonePropertyValue = TextDataType;

/**
 * The issue's title.
 */
export type Title1PropertyValue = TextDataType;

/**
 * A flag that indicates whether the issue is in the trash bin.
 */
export type TrashedPropertyValue = BooleanDataType;

/**
 * The time at which the issue left triage.
 */
export type TriagedAtPropertyValue = TextDataType;

/**
 * The time at which the trial of the plus plan will end.
 */
export type TrialEndsAtPropertyValue = TextDataType;

/**
 * The organization's unique URL key.
 */
export type URLKeyPropertyValue = TextDataType;

/**
 * The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.
 */
export type UpdatedAtPropertyValue = TextDataType;

export type User = Entity<UserProperties>;

export type UserBelongsToOrganizationLink = {
  linkEntity: BelongsToOrganization;
  rightEntity: Organization;
};

/**
 * Number of active users in the organization.
 */
export type UserCountPropertyValue = NumberDataType;

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

export type WorkflowState = Entity<WorkflowStateProperties>;

export type WorkflowStateOutgoingLinkAndTarget = never;

export type WorkflowStateOutgoingLinksByLinkEntityTypeId = {};

/**
 * A state in a team workflow.
 */
export type WorkflowStateProperties = {};
