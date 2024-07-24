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
 * A Facebook account.
 */
export interface FacebookAccount extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/facebook-account/v/1";
  properties: FacebookAccountProperties;
  propertiesWithMetadata: FacebookAccountPropertiesWithMetadata;
}

export type FacebookAccountOutgoingLinkAndTarget = never;

export interface FacebookAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A Facebook account.
 */
export interface FacebookAccountProperties
  extends FacebookAccountProperties1,
    FacebookAccountProperties2 {}
export interface FacebookAccountProperties1 extends ServiceAccountProperties {}

export interface FacebookAccountProperties2 {}

export interface FacebookAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: FacebookAccountPropertiesWithMetadataValue;
}

export interface FacebookAccountPropertiesWithMetadataValue
  extends FacebookAccountPropertiesWithMetadataValue1,
    FacebookAccountPropertiesWithMetadataValue2 {}
export interface FacebookAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface FacebookAccountPropertiesWithMetadataValue2 {}
