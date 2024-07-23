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
  ServiceAccountPropertiesWithMetadataValue,
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
  ServiceAccountPropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A GitHub account.
 */
export interface GitHubAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/github-account/v/1";
  properties: GitHubAccountProperties;
  propertiesWithMetadata: GitHubAccountPropertiesWithMetadata;
}

export type GitHubAccountOutgoingLinkAndTarget = never;

export interface GitHubAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A GitHub account.
 */
export interface GitHubAccountProperties
  extends GitHubAccountProperties1,
    GitHubAccountProperties2 {}
export interface GitHubAccountProperties1 extends ServiceAccountProperties {}

export interface GitHubAccountProperties2 {}

export interface GitHubAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: GitHubAccountPropertiesWithMetadataValue;
}

export interface GitHubAccountPropertiesWithMetadataValue
  extends GitHubAccountPropertiesWithMetadataValue1,
    GitHubAccountPropertiesWithMetadataValue2 {}
export interface GitHubAccountPropertiesWithMetadataValue1
  extends ServiceAccountPropertiesWithMetadataValue {}

export interface GitHubAccountPropertiesWithMetadataValue2 {}
