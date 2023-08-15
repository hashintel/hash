import { EntityTypeWithMetadata } from "@local/hash-subgraph";

export const isEntityTypeArchived = (entityType: EntityTypeWithMetadata) =>
  entityType.metadata.custom.temporalVersioning.transactionTime.end.kind ===
  "exclusive";
