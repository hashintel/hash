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
export type LinkedInAccountProperties = LinkedInAccountProperties1 &
  LinkedInAccountProperties2;
export type LinkedInAccountProperties1 = ServiceAccountProperties;

export interface LinkedInAccountProperties2 {}

export type LinkedInAccountPropertiesWithMetadata =
  LinkedInAccountPropertiesWithMetadata1 &
    LinkedInAccountPropertiesWithMetadata2;
export type LinkedInAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export interface LinkedInAccountPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}
