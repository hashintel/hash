import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";

export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet | null;
  linkTypes: EntityTypesSet | null;
  refetch: () => Promise<void>;
};
