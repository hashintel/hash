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
  TextDataType,
  UploadCompletedAtPropertyValue,
};

export type ImageV2 = Entity<ImageV2Properties>;

export type ImageV2OutgoingLinkAndTarget = never;

export type ImageV2OutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageV2Properties = ImageV2Properties1 & ImageV2Properties2;
export type ImageV2Properties1 = FileV2Properties;

export type ImageV2Properties2 = {};
