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

export type TikTokAccount = Entity<TikTokAccountProperties>;

export type TikTokAccountOutgoingLinkAndTarget = never;

export type TikTokAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A TikTok account.
 */
export type TikTokAccountProperties = TikTokAccountProperties1 &
  TikTokAccountProperties2;
export type TikTokAccountProperties1 = ServiceAccountProperties;

export type TikTokAccountProperties2 = {};

export type TikTokAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value?: {};
};
