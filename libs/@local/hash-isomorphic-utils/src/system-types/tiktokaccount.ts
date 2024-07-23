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
  ServiceAccountPropertiesWithMetadataValue,
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
  ServiceAccountPropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A TikTok account.
 */
export interface TikTokAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/tiktok-account/v/1";
  properties: TikTokAccountProperties;
  propertiesWithMetadata: TikTokAccountPropertiesWithMetadata;
}

export type TikTokAccountOutgoingLinkAndTarget = never;

export interface TikTokAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A TikTok account.
 */
export interface TikTokAccountProperties
  extends TikTokAccountProperties1,
    TikTokAccountProperties2 {}
export interface TikTokAccountProperties1 extends ServiceAccountProperties {}

export interface TikTokAccountProperties2 {}

export interface TikTokAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: TikTokAccountPropertiesWithMetadataValue;
}

export interface TikTokAccountPropertiesWithMetadataValue
  extends TikTokAccountPropertiesWithMetadataValue1,
    TikTokAccountPropertiesWithMetadataValue2 {}
export interface TikTokAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface TikTokAccountPropertiesWithMetadataValue2 {}
