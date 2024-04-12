/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-subgraph";

import type {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DocumentFile,
  DocumentFileOutgoingLinkAndTarget,
  DocumentFileOutgoingLinksByLinkEntityTypeId,
  DocumentFileProperties,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  ObjectDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
  TextualContentPropertyValue,
  UploadCompletedAtPropertyValue,
} from "./shared";

export type {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DocumentFile,
  DocumentFileOutgoingLinkAndTarget,
  DocumentFileOutgoingLinksByLinkEntityTypeId,
  DocumentFileProperties,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  ObjectDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
  TextualContentPropertyValue,
  UploadCompletedAtPropertyValue,
};

export type DOCXDocument = Entity<DOCXDocumentProperties>;

export type DOCXDocumentOutgoingLinkAndTarget = never;

export type DOCXDocumentOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Microsoft Word document.
 */
export type DOCXDocumentProperties = DOCXDocumentProperties1 &
  DOCXDocumentProperties2;
export type DOCXDocumentProperties1 = DocumentFileProperties;

export type DOCXDocumentProperties2 = {};
