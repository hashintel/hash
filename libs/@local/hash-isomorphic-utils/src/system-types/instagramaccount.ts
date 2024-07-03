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

export type InstagramAccount = Entity<InstagramAccountProperties>;

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
