import type {
  Entity,
  EntityEditionProvenance,
  EntityType,
  OntologyTypeVersion,
  PropertyDiff,
  PropertyMetadata,
  PropertyProvenance,
  PropertyType,
} from "@blockprotocol/type-system";

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
  metadata: PropertyMetadata;
  propertyType: PropertyType;
  provenance: {
    edition: EntityEditionProvenance;
    property?: PropertyProvenance;
  };
};

type TypeUpdateEvent = HistoryEventBase & {
  type: "type-update";
  entityType: {
    oldVersion?: OntologyTypeVersion;
    title: string;
    version: OntologyTypeVersion;
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

type ArchiveStatusChangeEvent = HistoryEventBase & {
  type: "archive-status-change";
  newArchiveStatus: boolean;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

export type HistoryEvent =
  | CreationEvent
  | PropertyUpdateEvent
  | TypeUpdateEvent
  | DraftStatusChangeEvent
  | ArchiveStatusChangeEvent;
