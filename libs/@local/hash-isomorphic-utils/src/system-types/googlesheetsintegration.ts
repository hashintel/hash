/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  AccountIdPropertyValue,
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  GoogleAccount,
  GoogleAccountOutgoingLinkAndTarget,
  GoogleAccountOutgoingLinksByLinkEntityTypeId,
  GoogleAccountProperties,
  GoogleAccountUsesUserSecretLink,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  ObjectDataType,
  TextDataType,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  VaultPathPropertyValue,
} from "./shared";

export type {
  AccountIdPropertyValue,
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  GoogleAccount,
  GoogleAccountOutgoingLinkAndTarget,
  GoogleAccountOutgoingLinksByLinkEntityTypeId,
  GoogleAccountProperties,
  GoogleAccountUsesUserSecretLink,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  ObjectDataType,
  TextDataType,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  VaultPathPropertyValue,
};

export type AssociatedWithAccount = Entity<AssociatedWithAccountProperties> & {
  linkData: LinkData;
};

export type AssociatedWithAccountOutgoingLinkAndTarget = never;

export type AssociatedWithAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * The account that something is associated with.
 */
export type AssociatedWithAccountProperties = AssociatedWithAccountProperties1 &
  AssociatedWithAccountProperties2;
export type AssociatedWithAccountProperties1 = LinkProperties;

export type AssociatedWithAccountProperties2 = {};

/**
 * A system identifier for a file.
 */
export type FileIdPropertyValue = TextDataType;

export type GoogleSheetsIntegration = Entity<GoogleSheetsIntegrationProperties>;

export type GoogleSheetsIntegrationAssociatedWithAccountLink = {
  linkEntity: AssociatedWithAccount;
  rightEntity: GoogleAccount;
};

export type GoogleSheetsIntegrationHasQueryLink = {
  linkEntity: HasQuery;
  rightEntity: Query;
};

export type GoogleSheetsIntegrationOutgoingLinkAndTarget =
  | GoogleSheetsIntegrationHasQueryLink
  | GoogleSheetsIntegrationAssociatedWithAccountLink;

export type GoogleSheetsIntegrationOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1": GoogleSheetsIntegrationHasQueryLink;
  "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1": GoogleSheetsIntegrationAssociatedWithAccountLink;
};

/**
 * An integration with Google Sheets.
 */
export type GoogleSheetsIntegrationProperties = {
  "https://hash.ai/@hash/types/property-type/file-id/": FileIdPropertyValue;
};

export type HasQuery = Entity<HasQueryProperties> & { linkData: LinkData };

export type HasQueryOutgoingLinkAndTarget = never;

export type HasQueryOutgoingLinksByLinkEntityTypeId = {};

/**
 * The query that something has.
 */
export type HasQueryProperties = HasQueryProperties1 & HasQueryProperties2;
export type HasQueryProperties1 = LinkProperties;

export type HasQueryProperties2 = {};

export type Query = Entity<QueryProperties>;

export type QueryOutgoingLinkAndTarget = never;

export type QueryOutgoingLinksByLinkEntityTypeId = {};

export type QueryProperties = {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValue;
};

/**
 * The query for something.
 */
export type QueryPropertyValue = ObjectDataType;
