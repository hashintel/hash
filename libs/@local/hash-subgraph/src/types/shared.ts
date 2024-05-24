import type {
  ActorType,
  ProvidedEntityEditionProvenanceOrigin,
  SourceProvenance,
} from "@local/hash-graph-client";

import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "./shared/branded";

export * from "./shared/branded";
export * from "./shared/temporal-versioning";

export type OntologyProvenance = {
  edition: OntologyEditionProvenance;
};

export type OntologyEditionProvenance = {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
  actorType?: ActorType;
  origin?: ProvidedEntityEditionProvenanceOrigin;
  sources?: Array<SourceProvenance>;
};

export type EntityProvenance = {
  createdById: CreatedById;
  createdAtTransactionTime: CreatedAtTransactionTime;
  createdAtDecisionTime: CreatedAtDecisionTime;
  edition: EntityEditionProvenance;
  firstNonDraftCreatedAtDecisionTime?: CreatedAtDecisionTime;
  firstNonDraftCreatedAtTransactionTime?: CreatedAtTransactionTime;
};

export type EntityEditionProvenance = {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
  actorType?: ActorType;
  origin?: ProvidedEntityEditionProvenanceOrigin;
  sources?: Array<SourceProvenance>;
};
