/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

import type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  NotificationPropertiesWithMetadataValue,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
  OccurredInEntityPropertiesWithMetadataValue,
  ReadAtPropertyValue,
  ReadAtPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  NotificationPropertiesWithMetadataValue,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
  OccurredInEntityPropertiesWithMetadataValue,
  ReadAtPropertyValue,
  ReadAtPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A notification of a change to a graph
 */
export interface GraphChangeNotification {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/graph-change-notification/v/1";
  properties: GraphChangeNotificationProperties;
  propertiesWithMetadata: GraphChangeNotificationPropertiesWithMetadata;
}

export interface GraphChangeNotificationOccurredInEntityLink {
  linkEntity: OccurredInEntity;
  rightEntity: Entity;
}

export type GraphChangeNotificationOutgoingLinkAndTarget =
  GraphChangeNotificationOccurredInEntityLink;

export interface GraphChangeNotificationOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2": GraphChangeNotificationOccurredInEntityLink;
}

/**
 * A notification of a change to a graph
 */
export interface GraphChangeNotificationProperties
  extends GraphChangeNotificationProperties1,
    GraphChangeNotificationProperties2 {}
export interface GraphChangeNotificationProperties1
  extends NotificationProperties {}

export interface GraphChangeNotificationProperties2 {
  "https://hash.ai/@hash/types/property-type/graph-change-type/": GraphChangeTypePropertyValue;
}

export interface GraphChangeNotificationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: GraphChangeNotificationPropertiesWithMetadataValue;
}

export interface GraphChangeNotificationPropertiesWithMetadataValue
  extends GraphChangeNotificationPropertiesWithMetadataValue1,
    GraphChangeNotificationPropertiesWithMetadataValue2 {}
export interface GraphChangeNotificationPropertiesWithMetadataValue1
  extends NotificationPropertiesWithMetadataValue {}

export interface GraphChangeNotificationPropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/graph-change-type/": GraphChangeTypePropertyValueWithMetadata;
}

/**
 * The type of change that occurred (e.g. create, update, archive)
 */
export type GraphChangeTypePropertyValue = TextDataType;

export interface GraphChangeTypePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}
