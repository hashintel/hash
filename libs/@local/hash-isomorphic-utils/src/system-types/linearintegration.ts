/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ConnectionSourceNamePropertyValue,
  DescriptionPropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  Org,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  PreferredNamePropertyValue,
  ResponsibilityPropertyValue,
  ShortnamePropertyValue,
  TextDataType,
  User,
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  VaultPathPropertyValue,
  WebsitePropertyValue,
} from "./shared";

export type {
  ConnectionSourceNamePropertyValue,
  DescriptionPropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  Org,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  PreferredNamePropertyValue,
  ResponsibilityPropertyValue,
  ShortnamePropertyValue,
  TextDataType,
  User,
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  VaultPathPropertyValue,
  WebsitePropertyValue,
};

export type LinearIntegration = Entity<LinearIntegrationProperties>;

export type LinearIntegrationOutgoingLinkAndTarget =
  | LinearIntegrationSyncLinearDataWithLink
  | LinearIntegrationUsesUserSecretLink;

export type LinearIntegrationOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/sync-linear-data-with/v/1": LinearIntegrationSyncLinearDataWithLink;
  "http://localhost:3000/@system-user/types/entity-type/uses-user-secret/v/1": LinearIntegrationUsesUserSecretLink;
};

/**
 * An instance of an integration with Linear.
 */
export type LinearIntegrationProperties = {
  "http://localhost:3000/@system-user/types/property-type/linear-org-id/": LinearOrgIdPropertyValue;
};

export type LinearIntegrationSyncLinearDataWithLink = {
  linkEntity: SyncLinearDataWith;
  rightEntity: User | Org;
};

export type LinearIntegrationUsesUserSecretLink = {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
};

/**
 * The unique identifier for an org in Linear.
 */
export type LinearOrgIdPropertyValue = TextDataType;

/**
 * The unique identifier for a team in Linear.
 */
export type LinearTeamIdPropertyValue = TextDataType;

export type SyncLinearDataWith = Entity<SyncLinearDataWithProperties> & {
  linkData: LinkData;
};

export type SyncLinearDataWithOutgoingLinkAndTarget = never;

export type SyncLinearDataWithOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that syncs linear data with something.
 */
export type SyncLinearDataWithProperties = SyncLinearDataWithProperties1 &
  SyncLinearDataWithProperties2;
export type SyncLinearDataWithProperties1 = LinkProperties;

export type SyncLinearDataWithProperties2 = {
  "http://localhost:3000/@system-user/types/property-type/linear-team-id/"?: LinearTeamIdPropertyValue[];
};

export type UsesUserSecret = Entity<UsesUserSecretProperties> & {
  linkData: LinkData;
};

export type UsesUserSecretOutgoingLinkAndTarget = never;

export type UsesUserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that uses a user secret.
 */
export type UsesUserSecretProperties = UsesUserSecretProperties1 &
  UsesUserSecretProperties2;
export type UsesUserSecretProperties1 = LinkProperties;

export type UsesUserSecretProperties2 = {};
