/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";

import type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
  FilePropertiesWithMetadataValue,
  FileSizePropertyValue,
  FileSizePropertyValueWithMetadata,
  FileStorageBucketPropertyValue,
  FileStorageBucketPropertyValueWithMetadata,
  FileStorageEndpointPropertyValue,
  FileStorageEndpointPropertyValueWithMetadata,
  FileStorageForcePathStylePropertyValue,
  FileStorageForcePathStylePropertyValueWithMetadata,
  FileStorageKeyPropertyValue,
  FileStorageKeyPropertyValueWithMetadata,
  FileStorageProviderPropertyValue,
  FileStorageProviderPropertyValueWithMetadata,
  FileStorageRegionPropertyValue,
  FileStorageRegionPropertyValueWithMetadata,
  FileURLPropertyValue,
  FileURLPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
} from "./shared.js";

export type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
  FilePropertiesWithMetadataValue,
  FileSizePropertyValue,
  FileSizePropertyValueWithMetadata,
  FileStorageBucketPropertyValue,
  FileStorageBucketPropertyValueWithMetadata,
  FileStorageEndpointPropertyValue,
  FileStorageEndpointPropertyValueWithMetadata,
  FileStorageForcePathStylePropertyValue,
  FileStorageForcePathStylePropertyValueWithMetadata,
  FileStorageKeyPropertyValue,
  FileStorageKeyPropertyValueWithMetadata,
  FileStorageProviderPropertyValue,
  FileStorageProviderPropertyValueWithMetadata,
  FileStorageRegionPropertyValue,
  FileStorageRegionPropertyValueWithMetadata,
  FileURLPropertyValue,
  FileURLPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
};

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
