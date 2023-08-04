/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  Block,
  BlockBlockDataLink,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  TextDataType,
} from "./shared";

export type {
  Block,
  BlockBlockDataLink,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  TextDataType,
};

/**
 * Whether or not something has been archived.
 */
export type ArchivedPropertyValue = BooleanDataType;

export type Contains = Entity<ContainsProperties> & { linkData: LinkData };

export type ContainsOutgoingLinkAndTarget = never;

export type ContainsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something containing something.
 */
export type ContainsProperties = ContainsProperties1 & ContainsProperties2;
export type ContainsProperties1 = LinkProperties;

export type ContainsProperties2 = {};

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

/**
 * The (fractional) index indicating the current position of something.
 */
export type IndexPropertyValue = TextDataType;

export type Page = Entity<PageProperties>;

export type PageContainsLink = { linkEntity: Contains; rightEntity: Block };

export type PageOutgoingLinkAndTarget = PageParentLink | PageContainsLink;

export type PageOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/parent/v/1": PageParentLink;
  "http://localhost:3000/@system-user/types/entity-type/contains/v/1": PageContainsLink;
};

export type PageParentLink = { linkEntity: Parent; rightEntity: Page };

export type PageProperties = {
  "http://localhost:3000/@system-user/types/property-type/title/": TitlePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/archived/"?: ArchivedPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/index/": IndexPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/icon/"?: IconPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/summary/"?: SummaryPropertyValue;
};

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

/**
 * The title of something.
 */
export type TitlePropertyValue = TextDataType;
