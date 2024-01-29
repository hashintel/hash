/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
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
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  SpreadsheetFile,
  SpreadsheetFileOutgoingLinkAndTarget,
  SpreadsheetFileOutgoingLinksByLinkEntityTypeId,
  SpreadsheetFileProperties,
  TextDataType,
  UploadCompletedAtPropertyValue,
} from "./shared";

export type {
  BooleanDataType,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
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
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  SpreadsheetFile,
  SpreadsheetFileOutgoingLinkAndTarget,
  SpreadsheetFileOutgoingLinksByLinkEntityTypeId,
  SpreadsheetFileProperties,
  TextDataType,
  UploadCompletedAtPropertyValue,
};

export type XLSXSpreadsheet = Entity<XLSXSpreadsheetProperties>;

export type XLSXSpreadsheetOutgoingLinkAndTarget = never;

export type XLSXSpreadsheetOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Microsoft Excel spreadsheet.
 */
export type XLSXSpreadsheetProperties = XLSXSpreadsheetProperties1 &
  XLSXSpreadsheetProperties2;
export type XLSXSpreadsheetProperties1 = SpreadsheetFileProperties;

export type XLSXSpreadsheetProperties2 = {};
