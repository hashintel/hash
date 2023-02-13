import { VersionedUri } from "@blockprotocol/type-system";
import {
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph";

export type EntityTypesSet = Record<VersionedUri, EntityTypeWithMetadata>;
export type EntityTypesContextValue = {
  entityTypes: EntityTypesSet | null;
  linkTypes: EntityTypesSet | null;
  subgraph: Subgraph<SubgraphRootTypes["entityType"]> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
