/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

export type Account = {
  properties: AccountProperties;
  propertiesWithMetadata: AccountPropertiesWithMetadata;
};

/**
 * A unique identifier for a Google account.
 */
export type AccountIdPropertyValue = TextDataType;

export type AccountIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

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

export type AccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/email/": EmailPropertyValueWithMetadata;
  };
};

export type AccountUsesUserSecretLink = {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
};

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type ConnectionSourceNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

export type EmailPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

export type ExpiredAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type Link = {
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

export type UserSecret = {
  properties: UserSecretProperties;
  propertiesWithMetadata: UserSecretPropertiesWithMetadata;
};

export type UserSecretOutgoingLinkAndTarget = never;

export type UserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecretProperties = {
  "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValue;
};

export type UserSecretPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
  };
};

export type UsesUserSecret = {
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
};

export type UsesUserSecretOutgoingLinkAndTarget = never;

export type UsesUserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = UsesUserSecretProperties1 &
  UsesUserSecretProperties2;
export type UsesUserSecretProperties1 = LinkProperties;

export type UsesUserSecretProperties2 = {};

export type UsesUserSecretPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;
