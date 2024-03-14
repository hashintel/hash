/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@blockprotocol/graph";

import type {
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
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
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
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

export type Account = Entity<AccountProperties>;

/**
 * A unique identifier for a Google account.
 */
export type AccountIdPropertyValue = TextDataType;

export type AccountOutgoingLinkAndTarget = AccountUsesUserSecretLink;

export type AccountOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1": AccountUsesUserSecretLink;
};

/**
 * A Google user account.
 */
export type AccountProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValue;
  "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValue;
};

export type AccountUsesUserSecretLink = {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
};

/**
 * The type of thing that can, should or will act on something.
 */
export type ActorTypeDataType = "human" | "machine";

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
 * The expected audience for some data.
 */
export type DataAudiencePropertyValue = ActorTypeDataType;

/**
 * A system identifier for a file.
 */
export type FileIdPropertyValue = TextDataType;

export type GoogleSheetsIntegration = Entity<GoogleSheetsIntegrationProperties>;

export type GoogleSheetsIntegrationAssociatedWithAccountLink = {
  linkEntity: AssociatedWithAccount;
  rightEntity: Account;
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
  "https://hash.ai/@hash/types/property-type/data-audience/": DataAudiencePropertyValue;
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
