import {
  ArchivedById,
  CreatedById,
  EditionCreatedById,
} from "./shared/branded";

export * from "./shared/branded";
export * from "./shared/temporal-versioning";

export type OntologyProvenanceMetadata = {
  createdById: CreatedById;
  archivedById?: ArchivedById;
};

export type EntityProvenanceMetadata = {
  edition: EntityEditionProvenanceMetadata;
};

export type EntityEditionProvenanceMetadata = {
  createdById: EditionCreatedById;
};
