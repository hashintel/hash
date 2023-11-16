/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ActivePropertyValue,
  AdminPropertyValue,
  ArchivedAtPropertyValue,
  AssignedIssue,
  AssignedIssueOutgoingLinkAndTarget,
  AssignedIssueOutgoingLinksByLinkEntityTypeId,
  AssignedIssueProperties,
  AvatarURLPropertyValue,
  BooleanDataType,
  CreatedAtPropertyValue,
  CreatedIssue,
  CreatedIssueCountPropertyValue,
  CreatedIssueOutgoingLinkAndTarget,
  CreatedIssueOutgoingLinksByLinkEntityTypeId,
  CreatedIssueProperties,
  DescriptionPropertyValue,
  DisableReasonPropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  GuestPropertyValue,
  IDPropertyValue,
  InviteHashPropertyValue,
  IsMePropertyValue,
  LastSeenPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NamePropertyValue,
  NumberDataType,
  StatusEmojiPropertyValue,
  StatusLabelPropertyValue,
  StatusUntilAtPropertyValue,
  TextDataType,
  TimezonePropertyValue,
  UpdatedAtPropertyValue,
  URLPropertyValue,
  User,
  UserAssignedIssueLink,
  UserCreatedIssueLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
} from "./shared";

export type {
  ActivePropertyValue,
  AdminPropertyValue,
  ArchivedAtPropertyValue,
  AssignedIssue,
  AssignedIssueOutgoingLinkAndTarget,
  AssignedIssueOutgoingLinksByLinkEntityTypeId,
  AssignedIssueProperties,
  AvatarURLPropertyValue,
  BooleanDataType,
  CreatedAtPropertyValue,
  CreatedIssue,
  CreatedIssueCountPropertyValue,
  CreatedIssueOutgoingLinkAndTarget,
  CreatedIssueOutgoingLinksByLinkEntityTypeId,
  CreatedIssueProperties,
  DescriptionPropertyValue,
  DisableReasonPropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  GuestPropertyValue,
  IDPropertyValue,
  InviteHashPropertyValue,
  IsMePropertyValue,
  LastSeenPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NamePropertyValue,
  NumberDataType,
  StatusEmojiPropertyValue,
  StatusLabelPropertyValue,
  StatusUntilAtPropertyValue,
  TextDataType,
  TimezonePropertyValue,
  UpdatedAtPropertyValue,
  URLPropertyValue,
  User,
  UserAssignedIssueLink,
  UserCreatedIssueLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
};

export type Assignee = Entity<AssigneeProperties> & { linkData: LinkData };

export type AssigneeOutgoingLinkAndTarget = never;

export type AssigneeOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user to whom the issue is assigned to.
 */
export type AssigneeProperties = AssigneeProperties1 & AssigneeProperties2;
export type AssigneeProperties1 = LinkProperties;

export type AssigneeProperties2 = {};

/**
 * The time at which the issue was automatically archived by the auto pruning process.
 */
export type AutoArchivedAtPropertyValue = TextDataType;

/**
 * The time at which the issue was automatically closed by the auto pruning process.
 */
export type AutoClosedAtPropertyValue = TextDataType;

/**
 * Suggested branch name for the issue.
 */
export type BranchNamePropertyValue = TextDataType;

/**
 * The time at which the issue was moved into canceled state.
 */
export type CanceledAtPropertyValue = TextDataType;

export type Child = Entity<ChildProperties> & { linkData: LinkData };

export type ChildOutgoingLinkAndTarget = never;

export type ChildOutgoingLinksByLinkEntityTypeId = {};

/**
 * Child of the issue.
 */
export type ChildProperties = ChildProperties1 & ChildProperties2;
export type ChildProperties1 = LinkProperties;

export type ChildProperties2 = {};

/**
 * The time at which the issue was moved into completed state.
 */
export type CompletedAtPropertyValue = TextDataType;

export type Creator = Entity<CreatorProperties> & { linkData: LinkData };

export type CreatorOutgoingLinkAndTarget = never;

export type CreatorOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user who created the issue.
 */
export type CreatorProperties = CreatorProperties1 & CreatorProperties2;
export type CreatorProperties1 = LinkProperties;

export type CreatorProperties2 = {};

/**
 * Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).
 */
export type CustomerTicketCountPropertyValue = NumberDataType;

/**
 * The date at which the issue is due.
 */
export type DueDatePropertyValue = TextDataType;

/**
 * The estimate of the complexity of the issue.
 */
export type EstimatePropertyValue = NumberDataType;

/**
 * Issue's human readable identifier (e.g. ENG-123).
 */
export type IdentifierPropertyValue = TextDataType;

export type Issue = Entity<IssueProperties>;

export type IssueAssigneeLink = { linkEntity: Assignee; rightEntity: User };

export type IssueChildLink = { linkEntity: Child; rightEntity: Issue };

export type IssueCreatorLink = { linkEntity: Creator; rightEntity: User };

export type IssueOutgoingLinkAndTarget =
  | IssueAssigneeLink
  | IssueChildLink
  | IssueCreatorLink
  | IssueParentLink
  | IssueSnoozedByLink
  | IssueSubscriberLink;

export type IssueOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/assignee/v/1": IssueAssigneeLink;
  "https://hash.ai/@linear/types/entity-type/child/v/1": IssueChildLink;
  "https://hash.ai/@linear/types/entity-type/creator/v/1": IssueCreatorLink;
  "https://hash.ai/@linear/types/entity-type/parent/v/1": IssueParentLink;
  "https://hash.ai/@linear/types/entity-type/snoozed-by/v/1": IssueSnoozedByLink;
  "https://hash.ai/@linear/types/entity-type/subscriber/v/1": IssueSubscriberLink;
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
  "https://hash.ai/@linear/types/property-type/markdown-description/"?: MarkdownDescriptionPropertyValue;
  "https://hash.ai/@linear/types/property-type/number/": NumberPropertyValue;
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
  "https://hash.ai/@linear/types/property-type/url/": URLPropertyValue;
};

export type IssueSnoozedByLink = { linkEntity: SnoozedBy; rightEntity: User };

export type IssueSubscriberLink = { linkEntity: Subscriber; rightEntity: User };

/**
 * The issue's description in markdown format.
 */
export type MarkdownDescriptionPropertyValue = TextDataType;

/**
 * The issue's unique number.
 */
export type NumberPropertyValue = NumberDataType;

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
 * Previous identifier of the issue if it has been moved between teams.
 */
export type PreviousIdentifierPropertyValue = TextDataType;

/**
 * Label for the priority.
 */
export type PriorityLabelPropertyValue = TextDataType;

/**
 * The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
 */
export type PriorityPropertyValue = NumberDataType;

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

/**
 * The order of the item in the sub-issue list. Only set if the issue has a parent.
 */
export type SubIssueSortOrderPropertyValue = NumberDataType;

export type Subscriber = Entity<SubscriberProperties> & { linkData: LinkData };

export type SubscriberOutgoingLinkAndTarget = never;

export type SubscriberOutgoingLinksByLinkEntityTypeId = {};

/**
 * User who are subscribed to the issue.
 */
export type SubscriberProperties = SubscriberProperties1 &
  SubscriberProperties2;
export type SubscriberProperties1 = LinkProperties;

export type SubscriberProperties2 = {};

/**
 * The issue's title.
 */
export type TitlePropertyValue = TextDataType;

/**
 * A flag that indicates whether the issue is in the trash bin.
 */
export type TrashedPropertyValue = BooleanDataType;

/**
 * The time at which the issue left triage.
 */
export type TriagedAtPropertyValue = TextDataType;
