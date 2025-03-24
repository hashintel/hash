/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

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
  URIDataType,
  URIDataTypeWithMetadata,
} from "./shared.js";

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
  URIDataType,
  URIDataTypeWithMetadata,
};

/**
 * A GitHub account.
 */
export type GitHubAccount = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/github-account/v/1"];
  properties: GitHubAccountProperties;
  propertiesWithMetadata: GitHubAccountPropertiesWithMetadata;
};

export type GitHubAccountOutgoingLinkAndTarget = never;

export type GitHubAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A GitHub account.
 */
export type GitHubAccountProperties = ServiceAccountProperties & {};

export type GitHubAccountPropertiesWithMetadata =
  ServiceAccountPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
