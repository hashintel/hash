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
 * A Facebook account.
 */
export type FacebookAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/facebook-account/v/1";
  properties: FacebookAccountProperties;
  propertiesWithMetadata: FacebookAccountPropertiesWithMetadata;
};

export type FacebookAccountOutgoingLinkAndTarget = never;

export type FacebookAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Facebook account.
 */
export type FacebookAccountProperties = FacebookAccountProperties1 &
  FacebookAccountProperties2;
export type FacebookAccountProperties1 = ServiceAccountProperties;

export type FacebookAccountProperties2 = {};

export type FacebookAccountPropertiesWithMetadata =
  FacebookAccountPropertiesWithMetadata1 &
    FacebookAccountPropertiesWithMetadata2;
export type FacebookAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type FacebookAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
