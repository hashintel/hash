/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";

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
 * A Twitter account.
 */
export interface TwitterAccount extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/twitter-account/v/1";
  properties: TwitterAccountProperties;
  propertiesWithMetadata: TwitterAccountPropertiesWithMetadata;
}

export type TwitterAccountOutgoingLinkAndTarget = never;

export interface TwitterAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A Twitter account.
 */
export interface TwitterAccountProperties
  extends TwitterAccountProperties1,
    TwitterAccountProperties2 {}
export interface TwitterAccountProperties1 extends ServiceAccountProperties {}

export interface TwitterAccountProperties2 {}

export interface TwitterAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: TwitterAccountPropertiesWithMetadataValue;
}

export interface TwitterAccountPropertiesWithMetadataValue
  extends TwitterAccountPropertiesWithMetadataValue1,
    TwitterAccountPropertiesWithMetadataValue2 {}
export interface TwitterAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface TwitterAccountPropertiesWithMetadataValue2 {}
