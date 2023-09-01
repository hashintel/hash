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

/**
 * A human-friendly display namae for something
 */
export type DisplayNamePropertyValue = TextDataType;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export type RemoteFileV3 = Entity<RemoteFileV3Properties>;

export type RemoteFileV3OutgoingLinkAndTarget = never;

export type RemoteFileV3OutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileV3Properties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
};

export type RemoteImageFile = Entity<RemoteImageFileProperties>;

export type RemoteImageFileOutgoingLinkAndTarget = never;

export type RemoteImageFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about an image file hosted at a remote URL.
 */
export type RemoteImageFileProperties = RemoteImageFileProperties1 &
  RemoteImageFileProperties2;
export type RemoteImageFileProperties1 = RemoteFileV3Properties;

export type RemoteImageFileProperties2 = {};
