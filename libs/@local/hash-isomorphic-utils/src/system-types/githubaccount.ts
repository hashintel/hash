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

export type GitHubAccount = Entity<GitHubAccountProperties>;

export type GitHubAccountOutgoingLinkAndTarget = never;

export type GitHubAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A GitHub account.
 */
export type GitHubAccountProperties = GitHubAccountProperties1 &
  GitHubAccountProperties2;
export type GitHubAccountProperties1 = ServiceAccountProperties;

export type GitHubAccountProperties2 = {};

export type GitHubAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
