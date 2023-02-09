import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata, Subgraph } from "@local/hash-types";

export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet | null;
  linkTypes: EntityTypesSet | null;
  subgraph: Subgraph<EntityTypeRootType> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
