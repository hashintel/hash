/**
 * This file was automatically generated – do not edit it.
 */

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
};

/**
 * A TikTok account.
 */
export type TikTokAccount = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/tiktok-account/v/1"];
  properties: TikTokAccountProperties;
  propertiesWithMetadata: TikTokAccountPropertiesWithMetadata;
};

export type TikTokAccountOutgoingLinkAndTarget = never;

export type TikTokAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A TikTok account.
 */
export type TikTokAccountProperties = TikTokAccountProperties1 &
  TikTokAccountProperties2;
export type TikTokAccountProperties1 = ServiceAccountProperties;

export type TikTokAccountProperties2 = {};

export type TikTokAccountPropertiesWithMetadata =
  TikTokAccountPropertiesWithMetadata1 & TikTokAccountPropertiesWithMetadata2;
export type TikTokAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type TikTokAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
