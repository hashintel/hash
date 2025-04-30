/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, ObjectMetadata } from "@blockprotocol/type-system";

import type {
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
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
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
  ReadAtPropertyValue,
  ReadAtPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A notification of a change to a graph
 */
export type GraphChangeNotification = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/graph-change-notification/v/1",
  ];
  properties: GraphChangeNotificationProperties;
  propertiesWithMetadata: GraphChangeNotificationPropertiesWithMetadata;
};

export type GraphChangeNotificationOccurredInEntityLink = {
  linkEntity: OccurredInEntity;
  rightEntity: Entity;
};

export type GraphChangeNotificationOutgoingLinkAndTarget =
  GraphChangeNotificationOccurredInEntityLink;

export type GraphChangeNotificationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/occurred-in-entity/v/2": GraphChangeNotificationOccurredInEntityLink;
};

/**
 * A notification of a change to a graph
 */
export type GraphChangeNotificationProperties = NotificationProperties & {
  "https://hash.ai/@h/types/property-type/graph-change-type/": GraphChangeTypePropertyValue;
};

export type GraphChangeNotificationPropertiesWithMetadata =
  NotificationPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/graph-change-type/": GraphChangeTypePropertyValueWithMetadata;
    };
  };

/**
 * The type of change that occurred (e.g. create, update, archive)
 */
export type GraphChangeTypePropertyValue = TextDataType;

export type GraphChangeTypePropertyValueWithMetadata = TextDataTypeWithMetadata;
