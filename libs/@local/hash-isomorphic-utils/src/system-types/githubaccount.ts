/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

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

/**
 * A GitHub account.
 */
export type GitHubAccount = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/github-account/v/1";
  properties: GitHubAccountProperties;
  propertiesWithMetadata: GitHubAccountPropertiesWithMetadata;
};

export type GitHubAccountOutgoingLinkAndTarget = never;

export type GitHubAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A GitHub account.
 */
export type GitHubAccountProperties = GitHubAccountProperties1 &
  GitHubAccountProperties2;
export type GitHubAccountProperties1 = ServiceAccountProperties;

export type GitHubAccountProperties2 = {};

export type GitHubAccountPropertiesWithMetadata =
  GitHubAccountPropertiesWithMetadata1 & GitHubAccountPropertiesWithMetadata2;
export type GitHubAccountPropertiesWithMetadata1 =
  ServiceAccountPropertiesWithMetadata;

export type GitHubAccountPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};
