import { VersionedUri } from "@blockprotocol/type-system";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet | null;
  linkTypes: EntityTypesSet | null;
  subgraph: Subgraph<EntityTypeRootType> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
