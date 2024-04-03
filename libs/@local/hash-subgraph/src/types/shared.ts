import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "./shared/branded";

export * from "./shared/branded";
export * from "./shared/temporal-versioning";

export type OntologyProvenanceMetadata = {
  edition: OntologyEditionProvenanceMetadata;
};

export type OntologyEditionProvenanceMetadata = {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
};

export type EntityProvenanceMetadata = {
  createdById: CreatedById;
  createdAtTransactionTime: CreatedAtTransactionTime;
  createdAtDecisionTime: CreatedAtDecisionTime;
  edition: EntityEditionProvenanceMetadata;
  firstNonDraftCreatedAtDecisionTime?: CreatedAtDecisionTime;
  firstNonDraftCreatedAtTransactionTime?: CreatedAtTransactionTime;
};

export type EntityEditionProvenanceMetadata = {
  createdById: EditionCreatedById;
};
