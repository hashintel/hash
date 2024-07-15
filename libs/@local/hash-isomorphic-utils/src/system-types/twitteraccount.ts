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
} from "./shared";

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
 * A Twitter account.
 */
export type TwitterAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/twitter-account/v/1";
  properties: TwitterAccountProperties;
  propertiesWithMetadata: TwitterAccountPropertiesWithMetadata;
};

export type TwitterAccountOutgoingLinkAndTarget = never;

export type TwitterAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Twitter account.
 */
export type TwitterAccountProperties = TwitterAccountProperties1 &
  TwitterAccountProperties2;
export type TwitterAccountProperties1 = ServiceAccountProperties;

export type TwitterAccountProperties2 = {};

export type TwitterAccountPropertiesWithMetadata =
  TwitterAccountPropertiesWithMetadata1 & TwitterAccountPropertiesWithMetadata2;
export type TwitterAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type TwitterAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
