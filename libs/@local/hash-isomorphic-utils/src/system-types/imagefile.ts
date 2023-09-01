/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  Description1PropertyValue,
  DisplayNamePropertyValue,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
} from "./shared";

export type {
  Description1PropertyValue,
  DisplayNamePropertyValue,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  TextDataType,
};

export type ImageFile = Entity<ImageFileProperties>;

export type ImageFileOutgoingLinkAndTarget = never;

export type ImageFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageFileProperties = ImageFileProperties1 & ImageFileProperties2;
export type ImageFileProperties1 = FileProperties;

export type ImageFileProperties2 = {};
