/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

/**
 * A Google user account.
 */
export interface Account {
  entityTypeId: "https://hash.ai/@google/types/entity-type/account/v/1";
  properties: AccountProperties;
  propertiesWithMetadata: AccountPropertiesWithMetadata;
}

/**
 * A unique identifier for a Google account.
 */
export type AccountIdPropertyValue = TextDataType;

export type AccountIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type AccountOutgoingLinkAndTarget = AccountUsesUserSecretLink;

export interface AccountOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1": AccountUsesUserSecretLink;
}

/**
 * A Google user account.
 */
export interface AccountProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValue;
  "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValue;
}

export interface AccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValueWithMetadata;
  };
}

export interface AccountUsesUserSecretLink {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
}

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type ConnectionSourceNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A human-friendly display name for something.
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An email address.
 */
export type EmailPropertyValue = TextDataType;

export type EmailPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

export type ExpiredAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Undefined.
 */
export interface Link {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
}

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId {}

export interface LinkProperties {}

export interface LinkPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * An ordered sequence of characters.
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
 * A secret or credential belonging to a user.
 */
export interface UserSecret {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/user-secret/v/1";
  properties: UserSecretProperties;
  propertiesWithMetadata: UserSecretPropertiesWithMetadata;
}

export type UserSecretOutgoingLinkAndTarget = never;

export interface UserSecretOutgoingLinksByLinkEntityTypeId {}

/**
 * A secret or credential belonging to a user.
 */
export interface UserSecretProperties {
  "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValue;
}

export interface UserSecretPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
  };
}

/**
 * The user secret something uses.
 */
export interface UsesUserSecret {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1";
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
}

export type UsesUserSecretOutgoingLinkAndTarget = never;

export interface UsesUserSecretOutgoingLinksByLinkEntityTypeId {}

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = UsesUserSecretProperties1 &
  UsesUserSecretProperties2;
export type UsesUserSecretProperties1 = LinkProperties;

export interface UsesUserSecretProperties2 {}

export type UsesUserSecretPropertiesWithMetadata =
  UsesUserSecretPropertiesWithMetadata1 & UsesUserSecretPropertiesWithMetadata2;
export type UsesUserSecretPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface UsesUserSecretPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;
