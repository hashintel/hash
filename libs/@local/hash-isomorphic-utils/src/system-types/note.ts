/**
 * This file was automatically generated – do not edit it.
 */

import type { VersionedUrl } from "@blockprotocol/type-system/slim";
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
export type Note = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/note/v/1" & VersionedUrl,
  ];
  properties: NoteProperties;
  propertiesWithMetadata: NotePropertiesWithMetadata;
};

export type NoteHasIndexedContentLink = {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
};

export type NoteOutgoingLinkAndTarget = NoteHasIndexedContentLink;

export type NoteOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-indexed-content/v/1": NoteHasIndexedContentLink;
};

/**
 * A (usually) quick or short note.
 */
export type NoteProperties = BlockCollectionProperties & {
  "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValue;
};

export type NotePropertiesWithMetadata =
  BlockCollectionPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
    };
  };
