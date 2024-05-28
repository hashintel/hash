/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-graph-types/entity";

import type {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
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
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
  UploadCompletedAtPropertyValue,
} from "./shared";

export type {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
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
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
  UploadCompletedAtPropertyValue,
};

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
