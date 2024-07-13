/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

import type {
  Account,
  AccountIdPropertyValue,
  AccountIdPropertyValueWithMetadata,
  AccountOutgoingLinkAndTarget,
  AccountOutgoingLinksByLinkEntityTypeId,
  AccountProperties,
  AccountPropertiesWithMetadata,
  AccountUsesUserSecretLink,
  ConnectionSourceNamePropertyValue,
  ConnectionSourceNamePropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  ExpiredAtPropertyValue,
  ExpiredAtPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  UsesUserSecretPropertiesWithMetadata,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
} from "./shared";

export type {
  Account,
  AccountIdPropertyValue,
  AccountIdPropertyValueWithMetadata,
  AccountOutgoingLinkAndTarget,
  AccountOutgoingLinksByLinkEntityTypeId,
  AccountProperties,
  AccountPropertiesWithMetadata,
  AccountUsesUserSecretLink,
  ConnectionSourceNamePropertyValue,
  ConnectionSourceNamePropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  ExpiredAtPropertyValue,
  ExpiredAtPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  UsesUserSecretPropertiesWithMetadata,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
};

/**
 * The type of thing that can, should or will act on something.
 */
export type ActorTypeDataType = "human" | "machine";

export type ActorTypeDataTypeWithMetadata = {
  value: ActorTypeDataType;
  metadata: ActorTypeDataTypeMetadata;
};
export type ActorTypeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/actor-type/v/1";
};

/**
 * The account that something is associated with.
 */
export type AssociatedWithAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1";
  properties: AssociatedWithAccountProperties;
  propertiesWithMetadata: AssociatedWithAccountPropertiesWithMetadata;
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

export type AssociatedWithAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type BooleanDataTypeWithMetadata = {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
};
export type BooleanDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
};

/**
 * The expected audience for some data.
 */
export type DataAudiencePropertyValue = ActorTypeDataType;

export type DataAudiencePropertyValueWithMetadata =
  ActorTypeDataTypeWithMetadata;

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = string;

export type DateTimeDataTypeWithMetadata = {
  value: DateTimeDataType;
  metadata: DateTimeDataTypeMetadata;
};
export type DateTimeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1";
};

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type DescriptionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A file hosted at a URL
 */
export type File = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/file/v/2";
  properties: FileProperties;
  propertiesWithMetadata: FilePropertiesWithMetadata;
};

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

export type FileHashPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A system identifier for a file.
 */
export type FileIdPropertyValue = TextDataType;

export type FileIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file hosted at a URL
 */
export type FileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
  "https://hash.ai/@hash/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValue;
};

export type FilePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValueWithMetadata;
  };
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

export type FileSizePropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

export type FileStorageBucketPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

export type FileStorageEndpointPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

export type FileStorageForcePathStylePropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

export type FileStorageKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

export type FileStorageProviderPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

export type FileStorageRegionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type FileURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A Google Sheets file.
 */
export type GoogleSheetsFile = {
  entityTypeId: "https://hash.ai/@google/types/entity-type/google-sheets-file/v/1";
  properties: GoogleSheetsFileProperties;
  propertiesWithMetadata: GoogleSheetsFilePropertiesWithMetadata;
};

export type GoogleSheetsFileAssociatedWithAccountLink = {
  linkEntity: AssociatedWithAccount;
  rightEntity: Account;
};

export type GoogleSheetsFileOutgoingLinkAndTarget =
  GoogleSheetsFileAssociatedWithAccountLink;

export type GoogleSheetsFileOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1": GoogleSheetsFileAssociatedWithAccountLink;
};

/**
 * A Google Sheets file.
 */
export type GoogleSheetsFileProperties = GoogleSheetsFileProperties1 &
  GoogleSheetsFileProperties2;
export type GoogleSheetsFileProperties1 = SpreadsheetFileProperties;

export type GoogleSheetsFileProperties2 = {
  "https://hash.ai/@hash/types/property-type/data-audience/": DataAudiencePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-id/": FileIdPropertyValue;
};

export type GoogleSheetsFilePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/data-audience/": DataAudiencePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-id/": FileIdPropertyValueWithMetadata;
  };
};

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export type MIMETypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export type NumberDataTypeWithMetadata = {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
};
export type NumberDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
};

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

export type OriginalFileNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

export type OriginalSourcePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export type OriginalURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A spreadsheet file.
 */
export type SpreadsheetFile = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/spreadsheet-file/v/1";
  properties: SpreadsheetFileProperties;
  propertiesWithMetadata: SpreadsheetFilePropertiesWithMetadata;
};

export type SpreadsheetFileOutgoingLinkAndTarget = never;

export type SpreadsheetFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A spreadsheet file.
 */
export type SpreadsheetFileProperties = SpreadsheetFileProperties1 &
  SpreadsheetFileProperties2;
export type SpreadsheetFileProperties1 = FileProperties;

export type SpreadsheetFileProperties2 = {};

export type SpreadsheetFilePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export type UploadCompletedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;
