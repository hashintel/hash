/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  DescriptionPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  TextDataType,
} from "./shared";

export type {
  DescriptionPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  MIMETypePropertyValue,
  TextDataType,
};

export type RemoteFileV2 = Entity<RemoteFileV2Properties>;

export type RemoteFileV2OutgoingLinkAndTarget = never;

export type RemoteFileV2OutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileV2Properties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/": MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/": FileNamePropertyValue;
};
