import { EditionArchivedById, EditionCreatedById } from "./shared/branded";

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
  edition: EntityEditionProvenanceMetadata;
};

export type EntityEditionProvenanceMetadata = {
  createdById: EditionCreatedById;
};
