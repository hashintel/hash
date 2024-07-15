/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

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
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
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
} from "./shared";

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
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
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
 * A Microsoft Word document.
 */
export type DOCXDocument = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/docx-document/v/1";
  properties: DOCXDocumentProperties;
  propertiesWithMetadata: DOCXDocumentPropertiesWithMetadata;
};

export type DOCXDocumentOutgoingLinkAndTarget = never;

export type DOCXDocumentOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Microsoft Word document.
 */
export type DOCXDocumentProperties = DOCXDocumentProperties1 &
  DOCXDocumentProperties2;
export type DOCXDocumentProperties1 = DocumentFileProperties;

export type DOCXDocumentProperties2 = {};

export type DOCXDocumentPropertiesWithMetadata =
  DOCXDocumentPropertiesWithMetadata1 & DOCXDocumentPropertiesWithMetadata2;
export type DOCXDocumentPropertiesWithMetadata1 =
  DocumentFilePropertiesWithMetadata;

export type DOCXDocumentPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
