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
