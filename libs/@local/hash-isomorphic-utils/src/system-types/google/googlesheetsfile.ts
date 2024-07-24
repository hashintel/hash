/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type {
  Confidence,
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

import type {
  Account,
  AccountIdPropertyValue,
  AccountIdPropertyValueWithMetadata,
  AccountOutgoingLinkAndTarget,
  AccountOutgoingLinksByLinkEntityTypeId,
  AccountProperties,
  AccountPropertiesWithMetadata,
  AccountPropertiesWithMetadataValue,
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
  LinkPropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UserSecretPropertiesWithMetadataValue,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  UsesUserSecretPropertiesWithMetadata,
  UsesUserSecretPropertiesWithMetadataValue,
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
  AccountPropertiesWithMetadataValue,
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
  LinkPropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UserSecretPropertiesWithMetadataValue,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  UsesUserSecretPropertiesWithMetadata,
  UsesUserSecretPropertiesWithMetadataValue,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
};

/**
 * The type of thing that can, should or will act on something.
 */
export type ActorTypeDataType = "human" | "machine";

export interface ActorTypeDataTypeWithMetadata {
  value: ActorTypeDataType;
  metadata: ActorTypeDataTypeMetadata;
}
export interface ActorTypeDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/actor-type/v/1";
}

/**
 * The account that something is associated with.
 */
export interface AssociatedWithAccount extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1";
  properties: AssociatedWithAccountProperties;
  propertiesWithMetadata: AssociatedWithAccountPropertiesWithMetadata;
}

export type AssociatedWithAccountOutgoingLinkAndTarget = never;

export interface AssociatedWithAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * The account that something is associated with.
 */
export interface AssociatedWithAccountProperties
  extends AssociatedWithAccountProperties1,
    AssociatedWithAccountProperties2 {}
export interface AssociatedWithAccountProperties1 extends LinkProperties {}

export interface AssociatedWithAccountProperties2 {}

export interface AssociatedWithAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: AssociatedWithAccountPropertiesWithMetadataValue;
}

export interface AssociatedWithAccountPropertiesWithMetadataValue
  extends AssociatedWithAccountPropertiesWithMetadataValue1,
    AssociatedWithAccountPropertiesWithMetadataValue2 {}
export interface AssociatedWithAccountPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface AssociatedWithAccountPropertiesWithMetadataValue2 {}

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export interface BooleanDataTypeWithMetadata {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
}
export interface BooleanDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
}

/**
 * The expected audience for some data.
 */
export type DataAudiencePropertyValue = ActorTypeDataType;

export interface DataAudiencePropertyValueWithMetadata
  extends ActorTypeDataTypeWithMetadata {}

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = string;

export interface DateTimeDataTypeWithMetadata {
  value: DateTimeDataType;
  metadata: DateTimeDataTypeMetadata;
}
export interface DateTimeDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1";
}

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export interface DescriptionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A file hosted at a URL
 */
export interface File extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/file/v/2";
  properties: FileProperties;
  propertiesWithMetadata: FilePropertiesWithMetadata;
}

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

export interface FileHashPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A system identifier for a file.
 */
export type FileIdPropertyValue = TextDataType;

export interface FileIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export interface FileNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

export type FileOutgoingLinkAndTarget = never;

export interface FileOutgoingLinksByLinkEntityTypeId {}

/**
 * A file hosted at a URL
 */
export interface FileProperties extends PropertyObject {
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
}

export interface FilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: FilePropertiesWithMetadataValue;
}

export interface FilePropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
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
}

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

export interface FileSizePropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

export interface FileStorageBucketPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

export interface FileStorageEndpointPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

export interface FileStorageForcePathStylePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

export interface FileStorageKeyPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

export interface FileStorageProviderPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

export interface FileStorageRegionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export interface FileURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A Google Sheets file.
 */
export interface GoogleSheetsFile extends EntityProperties {
  entityTypeId: "https://hash.ai/@google/types/entity-type/google-sheets-file/v/1";
  properties: GoogleSheetsFileProperties;
  propertiesWithMetadata: GoogleSheetsFilePropertiesWithMetadata;
}

export interface GoogleSheetsFileAssociatedWithAccountLink {
  linkEntity: AssociatedWithAccount;
  rightEntity: Account;
}

export type GoogleSheetsFileOutgoingLinkAndTarget =
  GoogleSheetsFileAssociatedWithAccountLink;

export interface GoogleSheetsFileOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/associated-with-account/v/1": GoogleSheetsFileAssociatedWithAccountLink;
}

/**
 * A Google Sheets file.
 */
export interface GoogleSheetsFileProperties
  extends GoogleSheetsFileProperties1,
    GoogleSheetsFileProperties2 {}
export interface GoogleSheetsFileProperties1
  extends SpreadsheetFileProperties {}

export interface GoogleSheetsFileProperties2 {
  "https://hash.ai/@hash/types/property-type/data-audience/": DataAudiencePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-id/": FileIdPropertyValue;
}

export interface GoogleSheetsFilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: GoogleSheetsFilePropertiesWithMetadataValue;
}

export interface GoogleSheetsFilePropertiesWithMetadataValue
  extends GoogleSheetsFilePropertiesWithMetadataValue1,
    GoogleSheetsFilePropertiesWithMetadataValue2 {}
export interface GoogleSheetsFilePropertiesWithMetadataValue1
  extends SpreadsheetFilePropertiesWithMetadataValue {}

export interface GoogleSheetsFilePropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/data-audience/": DataAudiencePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/file-id/": FileIdPropertyValueWithMetadata;
}

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export interface MIMETypePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export interface NumberDataTypeWithMetadata {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
}
export interface NumberDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
}

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

export interface OriginalFileNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

export interface OriginalSourcePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export interface OriginalURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A spreadsheet file.
 */
export interface SpreadsheetFile extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/spreadsheet-file/v/1";
  properties: SpreadsheetFileProperties;
  propertiesWithMetadata: SpreadsheetFilePropertiesWithMetadata;
}

export type SpreadsheetFileOutgoingLinkAndTarget = never;

export interface SpreadsheetFileOutgoingLinksByLinkEntityTypeId {}

/**
 * A spreadsheet file.
 */
export interface SpreadsheetFileProperties
  extends SpreadsheetFileProperties1,
    SpreadsheetFileProperties2 {}
export interface SpreadsheetFileProperties1 extends FileProperties {}

export interface SpreadsheetFileProperties2 {}

export interface SpreadsheetFilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: SpreadsheetFilePropertiesWithMetadataValue;
}

export interface SpreadsheetFilePropertiesWithMetadataValue
  extends SpreadsheetFilePropertiesWithMetadataValue1,
    SpreadsheetFilePropertiesWithMetadataValue2 {}
export interface SpreadsheetFilePropertiesWithMetadataValue1
  extends FilePropertiesWithMetadataValue {}

export interface SpreadsheetFilePropertiesWithMetadataValue2 {}

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export interface UploadCompletedAtPropertyValueWithMetadata
  extends DateTimeDataTypeWithMetadata {}
