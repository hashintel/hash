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
  entityTypes: EntityType[];
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
  entityType: {
    oldVersion?: number;
    title: string;
    version: number;
  };
  op: "added" | "removed" | "upgraded";
  provenance: {
    edition: EntityEditionProvenance;
  };
};

type DraftStatusChangeEvent = HistoryEventBase & {
  type: "draft-status-change";
  newDraftStatus: boolean;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

export type HistoryEvent =
  | CreationEvent
  | PropertyUpdateEvent
  | TypeUpdateEvent
  | DraftStatusChangeEvent;
