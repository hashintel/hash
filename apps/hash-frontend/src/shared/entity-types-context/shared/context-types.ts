import { VersionedUrl } from "@blockprotocol/type-system";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

export type EntityTypesContextValue = {
  entityTypes: EntityTypeWithMetadata[] | null;
  // a record of entity type ids to whether they are link types or not
  isLinkTypeLookup: Record<VersionedUrl, boolean> | null;
  subgraph: Subgraph<EntityTypeRootType> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
