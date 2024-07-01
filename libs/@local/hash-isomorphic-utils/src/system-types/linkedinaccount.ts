/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

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

export type LinkedInAccount = Entity<LinkedInAccountProperties>;

export type LinkedInAccountOutgoingLinkAndTarget = never;

export type LinkedInAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A LinkedIn account.
 */
export type LinkedInAccountProperties = LinkedInAccountProperties1 &
  LinkedInAccountProperties2;
export type LinkedInAccountProperties1 = ServiceAccountProperties;

export type LinkedInAccountProperties2 = {};

export type LinkedInAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
