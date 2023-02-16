import { UpdatedById } from "./shared/branded";

export * from "./shared/branded";
export * from "./shared/temporal-versioning";

export type ProvenanceMetadata = {
  updatedById: UpdatedById;
};
