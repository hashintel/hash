/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import { TextDataType } from "./shared";

export type { TextDataType };

/**
 * URL to an external file.
 */
export type ExternalFileURLPropertyValue = TextDataType;

export type File = Entity<FileProperties>;

/**
 * Key used to uniquely identify a file in a third-party system.
 */
export type FileKeyPropertyValue =
  | {
      "http://localhost:3000/@system-user/types/property-type/object-store-key/"?: ObjectStoreKeyPropertyValue;
    }
  | {
      "http://localhost:3000/@system-user/types/property-type/external-file-url/"?: ExternalFileURLPropertyValue;
    };

/**
 * Media type of a file.
 */
export type FileMediaTypePropertyValue = TextDataType;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file.
 */
export type FileProperties = {
  "http://localhost:3000/@system-user/types/property-type/file-url/": FileURLPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/file-key/": FileKeyPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/file-media-type/": FileMediaTypePropertyValue;
};

/**
 * URL to access a file.
 */
export type FileURLPropertyValue = TextDataType;

/**
 * Unique identifier for an object in an object store.
 */
export type ObjectStoreKeyPropertyValue = TextDataType;
