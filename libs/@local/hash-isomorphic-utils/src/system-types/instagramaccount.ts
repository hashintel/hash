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
 * An Instagram account.
 */
export interface InstagramAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/instagram-account/v/1";
  properties: InstagramAccountProperties;
  propertiesWithMetadata: InstagramAccountPropertiesWithMetadata;
}

export type InstagramAccountOutgoingLinkAndTarget = never;

export interface InstagramAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * An Instagram account.
 */
export interface InstagramAccountProperties
  extends InstagramAccountProperties1,
    InstagramAccountProperties2 {}
export interface InstagramAccountProperties1 extends ServiceAccountProperties {}

export interface InstagramAccountProperties2 {}

export interface InstagramAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: InstagramAccountPropertiesWithMetadataValue;
}

export interface InstagramAccountPropertiesWithMetadataValue
  extends InstagramAccountPropertiesWithMetadataValue1,
    InstagramAccountPropertiesWithMetadataValue2 {}
export interface InstagramAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface InstagramAccountPropertiesWithMetadataValue2 {}
