/**
 * This file was automatically generated – do not edit it.
 */

import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
} from "./shared.js";

export type {
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  URIDataType,
  URIDataTypeWithMetadata,
};

/**
 * An Instagram account.
 */
export type InstagramAccount = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/instagram-account/v/1" & VersionedUrl,
  ];
  properties: InstagramAccountProperties;
  propertiesWithMetadata: InstagramAccountPropertiesWithMetadata;
};

export type InstagramAccountOutgoingLinkAndTarget = never;

export type InstagramAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * An Instagram account.
 */
export type InstagramAccountProperties = ServiceAccountProperties & {};

export type InstagramAccountPropertiesWithMetadata =
  ServiceAccountPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
