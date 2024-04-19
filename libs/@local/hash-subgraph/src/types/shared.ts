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
};
