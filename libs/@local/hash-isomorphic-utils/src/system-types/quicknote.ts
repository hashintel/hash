/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  FractionalIndexPropertyValue,
  FractionalIndexPropertyValueWithMetadata,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  FractionalIndexPropertyValue,
  FractionalIndexPropertyValueWithMetadata,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A (usually) quick or short note.
 */
export type QuickNote = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/quick-note/v/1";
  properties: QuickNoteProperties;
  propertiesWithMetadata: QuickNotePropertiesWithMetadata;
};

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

export type QuickNotePropertiesWithMetadata = QuickNotePropertiesWithMetadata1 &
  QuickNotePropertiesWithMetadata2;
export type QuickNotePropertiesWithMetadata1 =
  BlockCollectionPropertiesWithMetadata;

export type QuickNotePropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
  };
};
