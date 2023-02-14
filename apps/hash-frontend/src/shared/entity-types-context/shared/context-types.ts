import {
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph/main";

export type EntityTypesContextValue = {
  entityTypes: EntityTypeWithMetadata[] | null;
  subgraph: Subgraph<SubgraphRootTypes["entityType"]> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
