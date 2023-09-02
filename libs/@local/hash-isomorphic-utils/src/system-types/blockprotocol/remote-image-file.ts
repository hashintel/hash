/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  DescriptionPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  RemoteFile,
  RemoteFileOutgoingLinkAndTarget,
  RemoteFileOutgoingLinksByLinkEntityTypeId,
  RemoteFileProperties,
  TextDataType,
} from "./shared";

export type {
  DescriptionPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  RemoteFile,
  RemoteFileOutgoingLinkAndTarget,
  RemoteFileOutgoingLinksByLinkEntityTypeId,
  RemoteFileProperties,
  TextDataType,
};

export type RemoteImageFile = Entity<RemoteImageFileProperties>;

export type RemoteImageFileOutgoingLinkAndTarget = never;

export type RemoteImageFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about an image file hosted at a remote URL.
 */
export type RemoteImageFileProperties = RemoteImageFileProperties1 &
  RemoteImageFileProperties2;
export type RemoteImageFileProperties1 = RemoteFileProperties;

export type RemoteImageFileProperties2 = {};
