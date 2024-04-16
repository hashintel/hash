/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-subgraph";

import type {
  ArchivedPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  FractionalIndexPropertyValue,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
} from "./shared";

export type {
  ArchivedPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  ComponentIdPropertyValue,
  FractionalIndexPropertyValue,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
};

export type QuickNote = Entity<QuickNoteProperties>;

export type QuickNoteHasIndexedContentLink = {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
};

export type QuickNoteOutgoingLinkAndTarget = QuickNoteHasIndexedContentLink;

export type QuickNoteOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1": QuickNoteHasIndexedContentLink;
};

/**
 * A (usually) quick or short note.
 */
export type QuickNoteProperties = QuickNoteProperties1 & QuickNoteProperties2;
export type QuickNoteProperties1 = BlockCollectionProperties;

export type QuickNoteProperties2 = {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
};
