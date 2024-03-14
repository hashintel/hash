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
