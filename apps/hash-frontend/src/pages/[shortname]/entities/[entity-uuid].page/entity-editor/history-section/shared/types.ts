import type {
  EntityEditionProvenance,
  EntityType,
  PropertyDiff,
  PropertyProvenance,
  PropertyType,
} from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

type HistoryEventBase = {
  number: string;
  timestamp: string;
};

type CreationEvent = HistoryEventBase & {
  type: "created";
  entity: Entity;
  entityType: EntityType;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

type PropertyUpdateEvent = HistoryEventBase & {
  type: "property-update";
  diff: PropertyDiff;
  propertyType: PropertyType;
  provenance: {
    edition: EntityEditionProvenance;
    property?: PropertyProvenance;
  };
};

type TypeUpdateEvent = HistoryEventBase & {
  type: "type-update";
  entityType: EntityType;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

export type HistoryEvent =
  | CreationEvent
  | PropertyUpdateEvent
  | TypeUpdateEvent;
