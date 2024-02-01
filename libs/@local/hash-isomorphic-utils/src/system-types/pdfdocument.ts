/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DocumentFile,
  DocumentFileOutgoingLinkAndTarget,
  DocumentFileOutgoingLinksByLinkEntityTypeId,
  DocumentFileProperties,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FileV2,
  FileV2OutgoingLinkAndTarget,
  FileV2OutgoingLinksByLinkEntityTypeId,
  FileV2Properties,
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
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FileV2,
  FileV2OutgoingLinkAndTarget,
  FileV2OutgoingLinksByLinkEntityTypeId,
  FileV2Properties,
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

export type PDFDocument = Entity<PDFDocumentProperties>;

export type PDFDocumentOutgoingLinkAndTarget = never;

export type PDFDocumentOutgoingLinksByLinkEntityTypeId = {};

/**
 * A PDF document.
 */
export type PDFDocumentProperties = PDFDocumentProperties1 &
  PDFDocumentProperties2;
export type PDFDocumentProperties1 = DocumentFileProperties;

export type PDFDocumentProperties2 = {};
