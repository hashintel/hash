/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  Created,
  CreatedOutgoingLinkAndTarget,
  CreatedOutgoingLinksByLinkEntityTypeId,
  CreatedProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
  TitlePropertyValue,
  URLPropertyValue,
  WebPage,
  WebPageOutgoingLinkAndTarget,
  WebPageOutgoingLinksByLinkEntityTypeId,
  WebPageProperties,
} from "./shared";

export type {
  Created,
  CreatedOutgoingLinkAndTarget,
  CreatedOutgoingLinksByLinkEntityTypeId,
  CreatedProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
  TitlePropertyValue,
  URLPropertyValue,
  WebPage,
  WebPageOutgoingLinkAndTarget,
  WebPageOutgoingLinksByLinkEntityTypeId,
  WebPageProperties,
};

/**
 * The timestamp when something has completed.
 */
export type CompletedAtPropertyValue = TextDataType;

/**
 * The prompt of something.
 */
export type PromptPropertyValue = TextDataType;

export type ResearchTask = Entity<ResearchTaskProperties>;

export type ResearchTaskCreatedLink = {
  linkEntity: Created;
  rightEntity: Entity;
};

export type ResearchTaskOutgoingLinkAndTarget =
  | ResearchTaskCreatedLink
  | ResearchTaskUsedResourceLink;

export type ResearchTaskOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/created/v/1": ResearchTaskCreatedLink;
  "https://hash.ai/@hash/types/entity-type/used-resource/v/1": ResearchTaskUsedResourceLink;
};

/**
 * A task to research something.
 */
export type ResearchTaskProperties = {
  "https://hash.ai/@hash/types/property-type/completed-at/"?: CompletedAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/prompt/": PromptPropertyValue;
};

export type ResearchTaskUsedResourceLink = {
  linkEntity: UsedResource;
  rightEntity: WebPage;
};

export type UsedResource = Entity<UsedResourceProperties> & {
  linkData: LinkData;
};

export type UsedResourceOutgoingLinkAndTarget = never;

export type UsedResourceOutgoingLinksByLinkEntityTypeId = {};

/**
 * A resource that was used by something.
 */
export type UsedResourceProperties = UsedResourceProperties1 &
  UsedResourceProperties2;
export type UsedResourceProperties1 = LinkProperties;

export type UsedResourceProperties2 = {};
