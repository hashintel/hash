/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
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
  ObjectDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  PresentationFile,
  PresentationFileOutgoingLinkAndTarget,
  PresentationFileOutgoingLinksByLinkEntityTypeId,
  PresentationFileProperties,
  TextDataType,
  TextualContentPropertyValue,
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
  ObjectDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  PresentationFile,
  PresentationFileOutgoingLinkAndTarget,
  PresentationFileOutgoingLinksByLinkEntityTypeId,
  PresentationFileProperties,
  TextDataType,
  TextualContentPropertyValue,
  UploadCompletedAtPropertyValue,
};

export type PPTXPresentation = Entity<PPTXPresentationProperties>;

export type PPTXPresentationOutgoingLinkAndTarget = never;

export type PPTXPresentationOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Microsoft PowerPoint presentation.
 */
export type PPTXPresentationProperties = PPTXPresentationProperties1 &
  PPTXPresentationProperties2;
export type PPTXPresentationProperties1 = PresentationFileProperties;

export type PPTXPresentationProperties2 = {};
