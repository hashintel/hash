/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@blockprotocol/graph";

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
