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
 * A TikTok account.
 */
export type TikTokAccount = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/tiktok-account/v/1"];
  properties: TikTokAccountProperties;
  propertiesWithMetadata: TikTokAccountPropertiesWithMetadata;
};

export type TikTokAccountOutgoingLinkAndTarget = never;

export type TikTokAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A TikTok account.
 */
export type TikTokAccountProperties = ServiceAccountProperties & {};

export type TikTokAccountPropertiesWithMetadata = ServiceAccountPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};
