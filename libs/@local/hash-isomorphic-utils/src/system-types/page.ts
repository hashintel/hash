/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  NumericIndexPropertyValue,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  TextDataType,
} from "./shared";

export type {
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  NumericIndexPropertyValue,
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

/**
 * The fractional index indicating the current position of something.
 */
export type FractionalIndexPropertyValue = TextDataType;

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

export type Page = Entity<PageProperties>;

export type PageOutgoingLinkAndTarget = PageParentLink;

export type PageOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/parent/v/1": PageParentLink;
};

export type PageParentLink = { linkEntity: Parent; rightEntity: Page };

export type PageProperties = PageProperties1 & PageProperties2;
export type PageProperties1 = BlockCollectionProperties;

export type PageProperties2 = {
  "http://localhost:3000/@system-user/types/property-type/archived/"?: ArchivedPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/fractional-index/": FractionalIndexPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/icon/"?: IconPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/summary/"?: SummaryPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/title/": TitlePropertyValue;
};

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

/**
 * The title of something.
 */
export type TitlePropertyValue = TextDataType;
