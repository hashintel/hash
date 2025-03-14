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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
};

/**
 * A page in document format, with content arranged in columns.
 */
export type Document = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/document/v/1" & VersionedUrl,
  ];
  properties: DocumentProperties;
  propertiesWithMetadata: DocumentPropertiesWithMetadata;
};

export type DocumentHasIndexedContentLink = {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
};

export type DocumentOutgoingLinkAndTarget = DocumentHasIndexedContentLink;

export type DocumentOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-indexed-content/v/1": DocumentHasIndexedContentLink;
};

/**
 * A page in document format, with content arranged in columns.
 */
export type DocumentProperties = PageProperties & {};

export type DocumentPropertiesWithMetadata = PagePropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};
