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
  NumberDataType,
  NumberDataTypeWithMetadata,
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
  NumberDataType,
  NumberDataTypeWithMetadata,
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
 * A page in canvas format, with content in a free-form arrangement.
 */
export type Canvas = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/canvas/v/1";
  properties: CanvasProperties;
  propertiesWithMetadata: CanvasPropertiesWithMetadata;
};

export type CanvasHasSpatiallyPositionedContentLink = {
  linkEntity: HasSpatiallyPositionedContent;
  rightEntity: Block;
};

export type CanvasOutgoingLinkAndTarget =
  CanvasHasSpatiallyPositionedContentLink;

export type CanvasOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1": CanvasHasSpatiallyPositionedContentLink;
};

/**
 * A page in canvas format, with content in a free-form arrangement.
 */
export type CanvasProperties = CanvasProperties1 & CanvasProperties2;
export type CanvasProperties1 = PageProperties;

export type CanvasProperties2 = {};

export type CanvasPropertiesWithMetadata = CanvasPropertiesWithMetadata1 &
  CanvasPropertiesWithMetadata2;
export type CanvasPropertiesWithMetadata1 = PagePropertiesWithMetadata;

export type CanvasPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Something contained at a spatial position by something
 */
export type HasSpatiallyPositionedContent = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-spatially-positioned-content/v/1";
  properties: HasSpatiallyPositionedContentProperties;
  propertiesWithMetadata: HasSpatiallyPositionedContentPropertiesWithMetadata;
};

export type HasSpatiallyPositionedContentOutgoingLinkAndTarget = never;

export type HasSpatiallyPositionedContentOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something contained at a spatial position by something
 */
export type HasSpatiallyPositionedContentProperties =
  HasSpatiallyPositionedContentProperties1 &
    HasSpatiallyPositionedContentProperties2;
export type HasSpatiallyPositionedContentProperties1 = LinkProperties;

export type HasSpatiallyPositionedContentProperties2 = {
  "https://hash.ai/@hash/types/property-type/height-in-pixels/": HeightInPixelsPropertyValue;
  "https://hash.ai/@hash/types/property-type/rotation-in-rads/": RotationInRadsPropertyValue;
  "https://hash.ai/@hash/types/property-type/width-in-pixels/": WidthInPixelsPropertyValue;
  "https://hash.ai/@hash/types/property-type/x-position/": XPositionPropertyValue;
  "https://hash.ai/@hash/types/property-type/y-position/": YPositionPropertyValue;
};

export type HasSpatiallyPositionedContentPropertiesWithMetadata =
  HasSpatiallyPositionedContentPropertiesWithMetadata1 &
    HasSpatiallyPositionedContentPropertiesWithMetadata2;
export type HasSpatiallyPositionedContentPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export type HasSpatiallyPositionedContentPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/height-in-pixels/": HeightInPixelsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/rotation-in-rads/": RotationInRadsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/width-in-pixels/": WidthInPixelsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/x-position/": XPositionPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/y-position/": YPositionPropertyValueWithMetadata;
  };
};

/**
 * The height of something in pixels.
 */
export type HeightInPixelsPropertyValue = NumberDataType;

export type HeightInPixelsPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The rotation of something in radians.
 */
export type RotationInRadsPropertyValue = NumberDataType;

export type RotationInRadsPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The width of something in pixels.
 */
export type WidthInPixelsPropertyValue = NumberDataType;

export type WidthInPixelsPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The position of something on the x axis.
 */
export type XPositionPropertyValue = NumberDataType;

export type XPositionPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The position of something on the y axis.
 */
export type YPositionPropertyValue = NumberDataType;

export type YPositionPropertyValueWithMetadata = NumberDataTypeWithMetadata;
