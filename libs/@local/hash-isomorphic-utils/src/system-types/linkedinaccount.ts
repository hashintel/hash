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
 * A LinkedIn account.
 */
export interface LinkedInAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1";
  properties: LinkedInAccountProperties;
  propertiesWithMetadata: LinkedInAccountPropertiesWithMetadata;
}

export type LinkedInAccountOutgoingLinkAndTarget = never;

export interface LinkedInAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A LinkedIn account.
 */
export interface LinkedInAccountProperties
  extends LinkedInAccountProperties1,
    LinkedInAccountProperties2 {}
export interface LinkedInAccountProperties1 extends ServiceAccountProperties {}

export interface LinkedInAccountProperties2 {}

export interface LinkedInAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: LinkedInAccountPropertiesWithMetadataValue;
}

export interface LinkedInAccountPropertiesWithMetadataValue
  extends LinkedInAccountPropertiesWithMetadataValue1,
    LinkedInAccountPropertiesWithMetadataValue2 {}
export interface LinkedInAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface LinkedInAccountPropertiesWithMetadataValue2 {}
