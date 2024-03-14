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
