/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

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
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  EmailDataType,
  EmailDataTypeWithMetadata,
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
} from "./shared.js";

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
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  EmailDataType,
  EmailDataTypeWithMetadata,
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
export type ActorTypeDataType = "user" | "machine";

export type ActorTypeDataTypeWithMetadata = {
  value: ActorTypeDataType;
  metadata: ActorTypeDataTypeMetadata;
};
export type ActorTypeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/actor-type/v/1";
};

/**
 * The account that something is associated with.
 */
export type AssociatedWithAccount = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/associated-with-account/v/1",
  ];
  properties: AssociatedWithAccountProperties;
  propertiesWithMetadata: AssociatedWithAccountPropertiesWithMetadata;
};

export type AssociatedWithAccountOutgoingLinkAndTarget = never;

export type AssociatedWithAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * The account that something is associated with.
 */
export type AssociatedWithAccountProperties = LinkProperties & {};

export type AssociatedWithAccountPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
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
 * A unit of information equal to eight bits.
 */
export type BytesDataType = InformationDataType;

export type BytesDataTypeWithMetadata = {
  value: BytesDataType;
  metadata: BytesDataTypeMetadata;
};
export type BytesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bytes/v/1";
};

/**
 * The expected audience for some data.
 */
export type DataAudiencePropertyValue = ActorTypeDataType;

export type DataAudiencePropertyValueWithMetadata =
  ActorTypeDataTypeWithMetadata;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type DescriptionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A file hosted at a URL
 */
export type File = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/file/v/2"];
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
  "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
  "https://hash.ai/@h/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValue;
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
    "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValueWithMetadata;
  };
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = BytesDataType;

export type FileSizePropertyValueWithMetadata = BytesDataTypeWithMetadata;

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
export type FileURLPropertyValue = URIDataType;

export type FileURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * A Google Sheets file.
 */
export type GoogleSheetsFile = {
  entityTypeIds: [
    "https://hash.ai/@google/types/entity-type/google-sheets-file/v/1",
  ];
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
  "https://hash.ai/@h/types/entity-type/associated-with-account/v/1": GoogleSheetsFileAssociatedWithAccountLink;
};

/**
 * A Google Sheets file.
 */
export type GoogleSheetsFileProperties = SpreadsheetFileProperties & {
  "https://hash.ai/@h/types/property-type/data-audience/": DataAudiencePropertyValue;
  "https://hash.ai/@h/types/property-type/file-id/": FileIdPropertyValue;
};

export type GoogleSheetsFilePropertiesWithMetadata =
  SpreadsheetFilePropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/data-audience/": DataAudiencePropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/file-id/": FileIdPropertyValueWithMetadata;
    };
  };

/**
 * A measure of information content.
 */
export type InformationDataType = NumberDataType;

export type InformationDataTypeWithMetadata = {
  value: InformationDataType;
  metadata: InformationDataTypeMetadata;
};
export type InformationDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/information/v/1";
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
export type OriginalURLPropertyValue = URIDataType;

export type OriginalURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * A spreadsheet file.
 */
export type SpreadsheetFile = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/spreadsheet-file/v/1"];
  properties: SpreadsheetFileProperties;
  propertiesWithMetadata: SpreadsheetFilePropertiesWithMetadata;
};

export type SpreadsheetFileOutgoingLinkAndTarget = never;

export type SpreadsheetFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A spreadsheet file.
 */
export type SpreadsheetFileProperties = FileProperties & {};

export type SpreadsheetFilePropertiesWithMetadata =
  FilePropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * A unique identifier for a resource (e.g. a URL, or URN).
 */
export type URIDataType = TextDataType;

export type URIDataTypeWithMetadata = {
  value: URIDataType;
  metadata: URIDataTypeMetadata;
};
export type URIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1";
};

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export type UploadCompletedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;
