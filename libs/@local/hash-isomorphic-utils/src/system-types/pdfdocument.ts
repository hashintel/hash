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
  DocumentFile,
  DocumentFileOutgoingLinkAndTarget,
  DocumentFileOutgoingLinksByLinkEntityTypeId,
  DocumentFileProperties,
  DocumentFilePropertiesWithMetadata,
  DocumentFilePropertiesWithMetadataValue,
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
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
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
  DocumentFile,
  DocumentFileOutgoingLinkAndTarget,
  DocumentFileOutgoingLinksByLinkEntityTypeId,
  DocumentFileProperties,
  DocumentFilePropertiesWithMetadata,
  DocumentFilePropertiesWithMetadataValue,
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
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
};

/**
 * A PDF document.
 */
export interface PDFDocument extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/pdf-document/v/1";
  properties: PDFDocumentProperties;
  propertiesWithMetadata: PDFDocumentPropertiesWithMetadata;
}

export type PDFDocumentOutgoingLinkAndTarget = never;

export interface PDFDocumentOutgoingLinksByLinkEntityTypeId {}

/**
 * A PDF document.
 */
export interface PDFDocumentProperties
  extends PDFDocumentProperties1,
    PDFDocumentProperties2 {}
export interface PDFDocumentProperties1 extends DocumentFileProperties {}

export interface PDFDocumentProperties2 {}

export interface PDFDocumentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: PDFDocumentPropertiesWithMetadataValue;
}

export interface PDFDocumentPropertiesWithMetadataValue
  extends PDFDocumentPropertiesWithMetadataValue1,
    PDFDocumentPropertiesWithMetadataValue2 {}
export interface PDFDocumentPropertiesWithMetadataValue1
  extends DocumentFilePropertiesWithMetadataValue {}

export interface PDFDocumentPropertiesWithMetadataValue2 {}
