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

export type FacebookAccount = Entity<FacebookAccountProperties>;

export type FacebookAccountOutgoingLinkAndTarget = never;

export type FacebookAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Facebook account.
 */
export type FacebookAccountProperties = FacebookAccountProperties1 &
  FacebookAccountProperties2;
export type FacebookAccountProperties1 = ServiceAccountProperties;

export type FacebookAccountProperties2 = {};

export type FacebookAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
