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
export type LinkedInAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/linkedin-account/v/1";
  properties: LinkedInAccountProperties;
  propertiesWithMetadata: LinkedInAccountPropertiesWithMetadata;
};

export type LinkedInAccountOutgoingLinkAndTarget = never;

export type LinkedInAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A LinkedIn account.
 */
export type LinkedInAccountProperties = LinkedInAccountProperties1 &
  LinkedInAccountProperties2;
export type LinkedInAccountProperties1 = ServiceAccountProperties;

export type LinkedInAccountProperties2 = {};

export type LinkedInAccountPropertiesWithMetadata =
  LinkedInAccountPropertiesWithMetadata1 &
    LinkedInAccountPropertiesWithMetadata2;
export type LinkedInAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type LinkedInAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
