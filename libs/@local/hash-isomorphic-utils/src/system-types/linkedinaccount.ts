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
 * A LinkedIn account.
 */
export type LinkedInAccount = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/linkedin-account/v/1" & VersionedUrl,
  ];
  properties: LinkedInAccountProperties;
  propertiesWithMetadata: LinkedInAccountPropertiesWithMetadata;
};

export type LinkedInAccountOutgoingLinkAndTarget = never;

export type LinkedInAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A LinkedIn account.
 */
export type LinkedInAccountProperties = ServiceAccountProperties & {};

export type LinkedInAccountPropertiesWithMetadata =
  ServiceAccountPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
