/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@blockprotocol/graph";

import type {
  ArchivedPropertyValue,
  BooleanDataType,
  EntityEditionIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  ReadAtPropertyValue,
  TextDataType,
} from "./shared";

export type {
  ArchivedPropertyValue,
  BooleanDataType,
  EntityEditionIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  ReadAtPropertyValue,
  TextDataType,
};

export type GraphChangeNotification = Entity<GraphChangeNotificationProperties>;

export type GraphChangeNotificationOccurredInEntityLink = {
  linkEntity: OccurredInEntity;
  rightEntity: Entity;
};

export type GraphChangeNotificationOutgoingLinkAndTarget =
  GraphChangeNotificationOccurredInEntityLink;

export type GraphChangeNotificationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2": GraphChangeNotificationOccurredInEntityLink;
};

/**
 * A notification of a change to a graph
 */
export type GraphChangeNotificationProperties =
  GraphChangeNotificationProperties1 & GraphChangeNotificationProperties2;
export type GraphChangeNotificationProperties1 = NotificationProperties;

export type GraphChangeNotificationProperties2 = {
  "https://hash.ai/@hash/types/property-type/graph-change-type/": GraphChangeTypePropertyValue;
};

/**
 * The type of change that occurred (e.g. create, update, archive)
 */
export type GraphChangeTypePropertyValue = TextDataType;
