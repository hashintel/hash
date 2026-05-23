/**
 * This file was automatically generated – do not edit it.
 */

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
import type { ObjectMetadata } from "@blockprotocol/type-system";

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
 * A Twitter account.
 */
export type TwitterAccount = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/twitter-account/v/1"];
  properties: TwitterAccountProperties;
  propertiesWithMetadata: TwitterAccountPropertiesWithMetadata;
};

export type TwitterAccountOutgoingLinkAndTarget = never;

export type TwitterAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Twitter account.
 */
export type TwitterAccountProperties = ServiceAccountProperties & {};

export type TwitterAccountPropertiesWithMetadata = ServiceAccountPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};
