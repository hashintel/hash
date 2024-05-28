/**
 * This file was automatically generated – do not edit it.
 */

import type { LinkData } from "@local/hash-graph-types/entity";
import type { Entity } from "@local/hash-subgraph";

import type {
  Account,
  AccountIdPropertyValue,
  AccountOutgoingLinkAndTarget,
  AccountOutgoingLinksByLinkEntityTypeId,
  AccountProperties,
  AccountUsesUserSecretLink,
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
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
  Account,
  AccountIdPropertyValue,
  AccountOutgoingLinkAndTarget,
  AccountOutgoingLinksByLinkEntityTypeId,
  AccountProperties,
  AccountUsesUserSecretLink,
  ConnectionSourceNamePropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
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
 * A True or False value
 */
export type BooleanDataType = boolean;

/**
 * The expected audience for some data.
 */
export type DataAudiencePropertyValue = ActorTypeDataType;

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = string;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type File = Entity<FileProperties>;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

/**
 * A system identifier for a file.
 */
export type FileIdPropertyValue = TextDataType;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

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

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type GoogleSheetsFile = Entity<GoogleSheetsFileProperties>;

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

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export type SpreadsheetFile = Entity<SpreadsheetFileProperties>;

export type SpreadsheetFileOutgoingLinkAndTarget = never;

export type SpreadsheetFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A spreadsheet file.
 */
export type SpreadsheetFileProperties = SpreadsheetFileProperties1 &
  SpreadsheetFileProperties2;
export type SpreadsheetFileProperties1 = FileProperties;

export type SpreadsheetFileProperties2 = {};

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;
