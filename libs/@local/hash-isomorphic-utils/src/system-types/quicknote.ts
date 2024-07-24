/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";

import type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockCollectionPropertiesWithMetadataValue,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BlockPropertiesWithMetadataValue,
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
  HasDataPropertiesWithMetadataValue,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasIndexedContentPropertiesWithMetadataValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
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
  BlockCollectionPropertiesWithMetadataValue,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BlockPropertiesWithMetadataValue,
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
  HasDataPropertiesWithMetadataValue,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasIndexedContentPropertiesWithMetadataValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A (usually) quick or short note.
 */
export interface QuickNote extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/quick-note/v/1";
  properties: QuickNoteProperties;
  propertiesWithMetadata: QuickNotePropertiesWithMetadata;
}

export interface QuickNoteHasIndexedContentLink {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
}

export type QuickNoteOutgoingLinkAndTarget = QuickNoteHasIndexedContentLink;

export interface QuickNoteOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1": QuickNoteHasIndexedContentLink;
}

/**
 * A (usually) quick or short note.
 */
export interface QuickNoteProperties
  extends QuickNoteProperties1,
    QuickNoteProperties2 {}
export interface QuickNoteProperties1 extends BlockCollectionProperties {}

export interface QuickNoteProperties2 {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
}

export interface QuickNotePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: QuickNotePropertiesWithMetadataValue;
}

export interface QuickNotePropertiesWithMetadataValue
  extends QuickNotePropertiesWithMetadataValue1,
    QuickNotePropertiesWithMetadataValue2 {}
export interface QuickNotePropertiesWithMetadataValue1
  extends BlockCollectionPropertiesWithMetadataValue {}

export interface QuickNotePropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
}
