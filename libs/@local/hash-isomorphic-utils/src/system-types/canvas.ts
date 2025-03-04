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
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/canvas/v/1"];
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
  "https://hash.ai/@h/types/entity-type/has-spatially-positioned-content/v/1": CanvasHasSpatiallyPositionedContentLink;
};

/**
 * A page in canvas format, with content in a free-form arrangement.
 */
export type CanvasProperties = PageProperties & {};

export type CanvasPropertiesWithMetadata = PagePropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Something contained at a spatial position by something
 */
export type HasSpatiallyPositionedContent = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/has-spatially-positioned-content/v/1",
  ];
  properties: HasSpatiallyPositionedContentProperties;
  propertiesWithMetadata: HasSpatiallyPositionedContentPropertiesWithMetadata;
};

export type HasSpatiallyPositionedContentOutgoingLinkAndTarget = never;

export type HasSpatiallyPositionedContentOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something contained at a spatial position by something
 */
export type HasSpatiallyPositionedContentProperties = LinkProperties & {
  "https://hash.ai/@h/types/property-type/height-in-pixels/": HeightInPixelsPropertyValue;
  "https://hash.ai/@h/types/property-type/rotation-in-rads/": RotationInRadsPropertyValue;
  "https://hash.ai/@h/types/property-type/width-in-pixels/": WidthInPixelsPropertyValue;
  "https://hash.ai/@h/types/property-type/x-position/": XPositionPropertyValue;
  "https://hash.ai/@h/types/property-type/y-position/": YPositionPropertyValue;
};

export type HasSpatiallyPositionedContentPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/height-in-pixels/": HeightInPixelsPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/rotation-in-rads/": RotationInRadsPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/width-in-pixels/": WidthInPixelsPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/x-position/": XPositionPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/y-position/": YPositionPropertyValueWithMetadata;
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
