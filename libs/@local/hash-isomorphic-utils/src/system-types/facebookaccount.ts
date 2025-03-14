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
 * A Facebook account.
 */
export type FacebookAccount = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/facebook-account/v/1" & VersionedUrl,
  ];
  properties: FacebookAccountProperties;
  propertiesWithMetadata: FacebookAccountPropertiesWithMetadata;
};

export type FacebookAccountOutgoingLinkAndTarget = never;

export type FacebookAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Facebook account.
 */
export type FacebookAccountProperties = ServiceAccountProperties & {};

export type FacebookAccountPropertiesWithMetadata =
  ServiceAccountPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
