/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

/**
 * Whether the user account is active or disabled (suspended).
 */
export type ActivePropertyValue = BooleanDataType;

/**
 * Whether the user is an organization administrator.
 */
export type AdminPropertyValue = BooleanDataType;

/**
 * The time at which the entity was archived. Null if the entity has not been archived.
 */
export type ArchivedAtPropertyValue = TextDataType;

export type AssignedIssue = Entity<AssignedIssueProperties> & {
  linkData: LinkData;
};

export type AssignedIssueOutgoingLinkAndTarget = never;

export type AssignedIssueOutgoingLinksByLinkEntityTypeId = {};

/**
 * Issue assigned to the user.
 */
export type AssignedIssueProperties = AssignedIssueProperties1 &
  AssignedIssueProperties2;
export type AssignedIssueProperties1 = LinkProperties;

export type AssignedIssueProperties2 = {};

/**
 * An URL to the user's avatar image.
 */
export type AvatarURLPropertyValue = TextDataType;

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

/**
 * The time at which the entity was created.
 */
export type CreatedAtPropertyValue = TextDataType;

export type CreatedIssue = Entity<CreatedIssueProperties> & {
  linkData: LinkData;
};

/**
 * Number of issues created.
 */
export type CreatedIssueCountPropertyValue = NumberDataType;

export type CreatedIssueOutgoingLinkAndTarget = never;

export type CreatedIssueOutgoingLinksByLinkEntityTypeId = {};

/**
 * Issue created by the user.
 */
export type CreatedIssueProperties = CreatedIssueProperties1 &
  CreatedIssueProperties2;
export type CreatedIssueProperties1 = LinkProperties;

export type CreatedIssueProperties2 = {};

/**
 * A short description of the user, either its title or bio.
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
 * The user's email address.
 */
export type EmailPropertyValue = TextDataType;

/**
 * Whether the user is a guest in the workspace and limited to accessing a subset of teams.
 */
export type GuestPropertyValue = BooleanDataType;

/**
 * The unique identifier of the entity.
 */
export type IDPropertyValue = TextDataType;

/**
 * Unique hash for the user to be used in invite URLs.
 */
export type InviteHashPropertyValue = TextDataType;

/**
 * Whether the user is the currently authenticated user.
 */
export type IsMePropertyValue = BooleanDataType;

/**
 * The last time the user was seen online. If null, the user is currently online.
 */
export type LastSeenPropertyValue = TextDataType;

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * The full name of the user or the organization's name.
 */
export type NamePropertyValue = TextDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * The emoji to represent the user current status.
 */
export type StatusEmojiPropertyValue = TextDataType;

/**
 * The label to represent the user current status.
 */
export type StatusLabelPropertyValue = TextDataType;

/**
 * A date at which the user current status should be cleared.
 */
export type StatusUntilAtPropertyValue = TextDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The local timezone of the user.
 */
export type TimezonePropertyValue = TextDataType;

/**
 * URL of a user's profile or issue.
 */
export type URLPropertyValue = TextDataType;

/**
 * The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.
 */
export type UpdatedAtPropertyValue = TextDataType;

export type User = Entity<UserProperties>;

export type UserAssignedIssueLink = {
  linkEntity: AssignedIssue;
  rightEntity: Entity;
};

export type UserCreatedIssueLink = {
  linkEntity: CreatedIssue;
  rightEntity: Entity;
};

export type UserOutgoingLinkAndTarget =
  | UserAssignedIssueLink
  | UserCreatedIssueLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/assigned-issue/v/1": UserAssignedIssueLink;
  "https://hash.ai/@linear/types/entity-type/created-issue/v/1": UserCreatedIssueLink;
};

/**
 * A user that has access to the the resources of an organization.
 */
export type UserProperties = {
  "https://hash.ai/@linear/types/property-type/active/": ActivePropertyValue;
  "https://hash.ai/@linear/types/property-type/admin/": AdminPropertyValue;
  "https://hash.ai/@linear/types/property-type/archived-at/"?: ArchivedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/avatar-url/"?: AvatarURLPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-at/": CreatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/created-issue-count/": CreatedIssueCountPropertyValue;
  "https://hash.ai/@linear/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@linear/types/property-type/disable-reason/"?: DisableReasonPropertyValue;
  "https://hash.ai/@linear/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@linear/types/property-type/email/": EmailPropertyValue;
  "https://hash.ai/@linear/types/property-type/guest/": GuestPropertyValue;
  "https://hash.ai/@linear/types/property-type/id/": IDPropertyValue;
  "https://hash.ai/@linear/types/property-type/invite-hash/": InviteHashPropertyValue;
  "https://hash.ai/@linear/types/property-type/is-me/": IsMePropertyValue;
  "https://hash.ai/@linear/types/property-type/last-seen/"?: LastSeenPropertyValue;
  "https://hash.ai/@linear/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@linear/types/property-type/status-emoji/"?: StatusEmojiPropertyValue;
  "https://hash.ai/@linear/types/property-type/status-label/"?: StatusLabelPropertyValue;
  "https://hash.ai/@linear/types/property-type/status-until-at/"?: StatusUntilAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/timezone/"?: TimezonePropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/url/": URLPropertyValue;
};
