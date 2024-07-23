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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  HasParentPropertiesWithMetadataValue,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  NumberDataType,
  NumberDataTypeWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  PagePropertiesWithMetadataValue,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
} from "./shared.js";
import { PropertyObject } from "@local/hash-graph-types/entity";

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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  HasParentPropertiesWithMetadataValue,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  NumberDataType,
  NumberDataTypeWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  PagePropertiesWithMetadataValue,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
};

/**
 * A page in canvas format, with content in a free-form arrangement.
 */
export interface Canvas {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/canvas/v/1";
  properties: CanvasProperties;
  propertiesWithMetadata: CanvasPropertiesWithMetadata;
}

export interface CanvasHasSpatiallyPositionedContentLink {
  linkEntity: HasSpatiallyPositionedContent;
  rightEntity: Block;
}

export type CanvasOutgoingLinkAndTarget =
  CanvasHasSpatiallyPositionedContentLink;

export interface CanvasOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1": CanvasHasSpatiallyPositionedContentLink;
}

/**
 * A page in canvas format, with content in a free-form arrangement.
 */
export interface CanvasProperties
  extends CanvasProperties1,
    CanvasProperties2 {}
export interface CanvasProperties1 extends PageProperties {}

export interface CanvasProperties2 {}

export interface CanvasPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: CanvasPropertiesWithMetadataValue;
}

export interface CanvasPropertiesWithMetadataValue
  extends CanvasPropertiesWithMetadataValue1,
    CanvasPropertiesWithMetadataValue2 {}
export interface CanvasPropertiesWithMetadataValue1
  extends PagePropertiesWithMetadataValue {}

export interface CanvasPropertiesWithMetadataValue2 {}

/**
 * Something contained at a spatial position by something
 */
export interface HasSpatiallyPositionedContent extends PropertyObject {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1";
  properties: HasSpatiallyPositionedContentProperties;
  propertiesWithMetadata: HasSpatiallyPositionedContentPropertiesWithMetadata;
}

export type HasSpatiallyPositionedContentOutgoingLinkAndTarget = never;

export interface HasSpatiallyPositionedContentOutgoingLinksByLinkEntityTypeId {}

/**
 * Something contained at a spatial position by something
 */
export interface HasSpatiallyPositionedContentProperties
  extends HasSpatiallyPositionedContentProperties1,
    HasSpatiallyPositionedContentProperties2 {}
export interface HasSpatiallyPositionedContentProperties1
  extends LinkProperties {}

export interface HasSpatiallyPositionedContentProperties2 {
  "https://hash.ai/@hash/types/property-type/height-in-pixels/": HeightInPixelsPropertyValue;
  "https://hash.ai/@hash/types/property-type/rotation-in-rads/": RotationInRadsPropertyValue;
  "https://hash.ai/@hash/types/property-type/width-in-pixels/": WidthInPixelsPropertyValue;
  "https://hash.ai/@hash/types/property-type/x-position/": XPositionPropertyValue;
  "https://hash.ai/@hash/types/property-type/y-position/": YPositionPropertyValue;
}

export interface HasSpatiallyPositionedContentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasSpatiallyPositionedContentPropertiesWithMetadataValue;
}

export interface HasSpatiallyPositionedContentPropertiesWithMetadataValue
  extends HasSpatiallyPositionedContentPropertiesWithMetadataValue1,
    HasSpatiallyPositionedContentPropertiesWithMetadataValue2 {}
export interface HasSpatiallyPositionedContentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasSpatiallyPositionedContentPropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/height-in-pixels/": HeightInPixelsPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/rotation-in-rads/": RotationInRadsPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/width-in-pixels/": WidthInPixelsPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/x-position/": XPositionPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/y-position/": YPositionPropertyValueWithMetadata;
}

/**
 * The height of something in pixels.
 */
export type HeightInPixelsPropertyValue = NumberDataType;

export interface HeightInPixelsPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The rotation of something in radians.
 */
export type RotationInRadsPropertyValue = NumberDataType;

export interface RotationInRadsPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The width of something in pixels.
 */
export type WidthInPixelsPropertyValue = NumberDataType;

export interface WidthInPixelsPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The position of something on the x axis.
 */
export type XPositionPropertyValue = NumberDataType;

export interface XPositionPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The position of something on the y axis.
 */
export type YPositionPropertyValue = NumberDataType;

export interface YPositionPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}
