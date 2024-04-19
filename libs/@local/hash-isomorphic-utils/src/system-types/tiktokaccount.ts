/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-subgraph";

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
