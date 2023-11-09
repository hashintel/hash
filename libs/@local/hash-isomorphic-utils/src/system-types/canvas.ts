/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  IconPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  SummaryPropertyValue,
  TextDataType,
  TitlePropertyValue,
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
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  IconPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  SummaryPropertyValue,
  TextDataType,
  TitlePropertyValue,
};

export type Canvas = Entity<CanvasProperties>;

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

export type HasSpatiallyPositionedContent =
  Entity<HasSpatiallyPositionedContentProperties> & { linkData: LinkData };

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

/**
 * The height of something in pixels.
 */
export type HeightInPixelsPropertyValue = NumberDataType;

/**
 * The rotation of something in radians.
 */
export type RotationInRadsPropertyValue = NumberDataType;

/**
 * The width of something in pixels.
 */
export type WidthInPixelsPropertyValue = NumberDataType;

/**
 * The position of something on the x axis.
 */
export type XPositionPropertyValue = NumberDataType;

/**
 * The position of something on the y axis.
 */
export type YPositionPropertyValue = NumberDataType;
