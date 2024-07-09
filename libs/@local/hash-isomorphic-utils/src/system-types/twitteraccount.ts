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

export type TwitterAccount = {
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

export type TwitterAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
