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
 * An Instagram account.
 */
export type InstagramAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/instagram-account/v/1";
  properties: InstagramAccountProperties;
  propertiesWithMetadata: InstagramAccountPropertiesWithMetadata;
};

export type InstagramAccountOutgoingLinkAndTarget = never;

export type InstagramAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * An Instagram account.
 */
export type InstagramAccountProperties = InstagramAccountProperties1 &
  InstagramAccountProperties2;
export type InstagramAccountProperties1 = ServiceAccountProperties;

export type InstagramAccountProperties2 = {};

export type InstagramAccountPropertiesWithMetadata =
  InstagramAccountPropertiesWithMetadata1 &
    InstagramAccountPropertiesWithMetadata2;
export type InstagramAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type InstagramAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
