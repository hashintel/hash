/**
 * This file was automatically generated – do not edit it.
 */

import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type {
  ProfileURLPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  TextDataType,
} from "./shared";

export type {
  ProfileURLPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  TextDataType,
};

export type TwitterAccount = SimpleEntity<TwitterAccountProperties>;

export type TwitterAccountOutgoingLinkAndTarget = never;

export type TwitterAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A Twitter account.
 */
export type TwitterAccountProperties = TwitterAccountProperties1 &
  TwitterAccountProperties2;
export type TwitterAccountProperties1 = ServiceAccountProperties;

export type TwitterAccountProperties2 = {};
