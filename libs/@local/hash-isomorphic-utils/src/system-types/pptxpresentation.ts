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
  PresentationFile,
  PresentationFileOutgoingLinkAndTarget,
  PresentationFileOutgoingLinksByLinkEntityTypeId,
  PresentationFileProperties,
  PresentationFilePropertiesWithMetadata,
  PresentationFilePropertiesWithMetadataValue,
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
  PresentationFile,
  PresentationFileOutgoingLinkAndTarget,
  PresentationFileOutgoingLinksByLinkEntityTypeId,
  PresentationFileProperties,
  PresentationFilePropertiesWithMetadata,
  PresentationFilePropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
};

/**
 * A Microsoft PowerPoint presentation.
 */
export interface PPTXPresentation {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/pptx-presentation/v/1";
  properties: PPTXPresentationProperties;
  propertiesWithMetadata: PPTXPresentationPropertiesWithMetadata;
}

export type PPTXPresentationOutgoingLinkAndTarget = never;

export interface PPTXPresentationOutgoingLinksByLinkEntityTypeId {}

/**
 * A Microsoft PowerPoint presentation.
 */
export interface PPTXPresentationProperties
  extends PPTXPresentationProperties1,
    PPTXPresentationProperties2 {}
export interface PPTXPresentationProperties1
  extends PresentationFileProperties {}

export interface PPTXPresentationProperties2 {}

export interface PPTXPresentationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: PPTXPresentationPropertiesWithMetadataValue;
}

export interface PPTXPresentationPropertiesWithMetadataValue
  extends PPTXPresentationPropertiesWithMetadataValue1,
    PPTXPresentationPropertiesWithMetadataValue2 {}
export interface PPTXPresentationPropertiesWithMetadataValue1
  extends PresentationFilePropertiesWithMetadataValue {}

export interface PPTXPresentationPropertiesWithMetadataValue2 {}
