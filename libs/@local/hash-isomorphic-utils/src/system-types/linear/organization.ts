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

/**
 * Allowed authentication provider.
 */
export type AllowedAuthServicePropertyValue = TextDataType;

/**
 * The time at which deletion of the organization was requested.
 */
export type DeletionRequestedAtPropertyValue = TextDataType;

/**
 * How git branches are formatted.
 */
export type GitBranchFormatPropertyValue = TextDataType;

/**
 * Whether the Git integration linkback messages should be sent to private repositories.
 */
export type GitLinkbackMessagesEnabledPropertyValue = TextDataType;

/**
 * Whether the Git integration linkback messages should be sent to public repositories.
 */
export type GitPublicLinkbackMessagesEnabledPropertyValue = TextDataType;

export type HasMember = Entity<HasMemberProperties> & { linkData: LinkData };

export type HasMemberOutgoingLinkAndTarget = never;

export type HasMemberOutgoingLinksByLinkEntityTypeId = {};

/**
 * Has this entity as a member.
 */
export type HasMemberProperties = HasMemberProperties1 & HasMemberProperties2;
export type HasMemberProperties1 = LinkProperties;

export type HasMemberProperties2 = {};

/**
 * The organization's logo URL.
 */
export type LogoURLPropertyValue = TextDataType;

export type Organization = Entity<OrganizationProperties>;

export type OrganizationHasMemberLink = {
  linkEntity: HasMember;
  rightEntity: User;
};

export type OrganizationOutgoingLinkAndTarget = OrganizationHasMemberLink;

export type OrganizationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@linear/types/entity-type/has-member/v/1": OrganizationHasMemberLink;
};

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type OrganizationProperties = {
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
  "https://hash.ai/@linear/types/property-type/previous-url-key/": PreviousURLKeyPropertyValue[];
  "https://hash.ai/@linear/types/property-type/project-update-reminders-hour/": ProjectUpdateRemindersHourPropertyValue;
  "https://hash.ai/@linear/types/property-type/roadmap-enabled/": RoadmapEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/saml-enabled/": SAMLEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/scim-enabled/": SCIMEnabledPropertyValue;
  "https://hash.ai/@linear/types/property-type/trial-ends-at/"?: TrialEndsAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/updated-at/": UpdatedAtPropertyValue;
  "https://hash.ai/@linear/types/property-type/url-key/": URLKeyPropertyValue;
  "https://hash.ai/@linear/types/property-type/user-count/": UserCountPropertyValue;
};

/**
 * Rolling 30-day total upload volume for the organization, in megabytes.
 */
export type PeriodUploadVolumePropertyValue = NumberDataType;

/**
 * Previously used URL key for the organization.
 */
export type PreviousURLKeyPropertyValue = TextDataType;

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

/**
 * The time at which the trial of the plus plan will end.
 */
export type TrialEndsAtPropertyValue = TextDataType;

/**
 * The organization's unique URL key.
 */
export type URLKeyPropertyValue = TextDataType;

/**
 * Number of active users in the organization.
 */
export type UserCountPropertyValue = NumberDataType;
