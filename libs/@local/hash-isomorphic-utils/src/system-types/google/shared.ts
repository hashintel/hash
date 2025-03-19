/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

/**
 * A Google user account.
 */
export type Account = {
  entityTypeIds: ["https://hash.ai/@google/types/entity-type/account/v/1"];
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
  "https://hash.ai/@h/types/entity-type/uses-user-secret/v/1": AccountUsesUserSecretLink;
};

/**
 * A Google user account.
 */
export type AccountProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValue;
  "https://hash.ai/@h/types/property-type/email/": EmailPropertyValue;
};

export type AccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@google/types/property-type/account-id/": AccountIdPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/email/": EmailPropertyValueWithMetadata;
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
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = DateTimeDataType;

export type ExpiredAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

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
 * A secret or credential belonging to a user.
 */
export type UserSecret = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/user-secret/v/1"];
  properties: UserSecretProperties;
  propertiesWithMetadata: UserSecretPropertiesWithMetadata;
};

export type UserSecretOutgoingLinkAndTarget = never;

export type UserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecretProperties = {
  "https://hash.ai/@h/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@h/types/property-type/vault-path/": VaultPathPropertyValue;
};

export type UserSecretPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
  };
};

/**
 * The user secret something uses.
 */
export type UsesUserSecret = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/uses-user-secret/v/1"];
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
};

export type UsesUserSecretOutgoingLinkAndTarget = never;

export type UsesUserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = LinkProperties & {};

export type UsesUserSecretPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;
