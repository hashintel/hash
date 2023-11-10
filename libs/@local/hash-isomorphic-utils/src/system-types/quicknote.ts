/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  ArchivedPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  NumericIndexPropertyValue,
  TextDataType,
} from "./shared";

export type {
  ArchivedPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  NumericIndexPropertyValue,
  TextDataType,
};

export type QuickNote = Entity<QuickNoteProperties>;

export type QuickNoteOutgoingLinkAndTarget = never;

export type QuickNoteOutgoingLinksByLinkEntityTypeId = {};

/**
 * A (usually) quick or short note.
 */
export type QuickNoteProperties = QuickNoteProperties1 & QuickNoteProperties2;
export type QuickNoteProperties1 = BlockCollectionProperties;

export type QuickNoteProperties2 = {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
};
