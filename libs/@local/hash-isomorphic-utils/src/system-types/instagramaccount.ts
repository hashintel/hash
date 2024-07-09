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

export type InstagramAccount = {
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

export type InstagramAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
