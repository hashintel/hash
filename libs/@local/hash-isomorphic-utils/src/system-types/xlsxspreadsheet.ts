/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  BooleanDataType,
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
  SpreadsheetFile,
  SpreadsheetFileOutgoingLinkAndTarget,
  SpreadsheetFileOutgoingLinksByLinkEntityTypeId,
  SpreadsheetFileProperties,
  TextDataType,
} from "./shared";

export type {
  BooleanDataType,
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
  SpreadsheetFile,
  SpreadsheetFileOutgoingLinkAndTarget,
  SpreadsheetFileOutgoingLinksByLinkEntityTypeId,
  SpreadsheetFileProperties,
  TextDataType,
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
