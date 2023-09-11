import { VersionedUrl } from "@blockprotocol/type-system";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

export type EntityTypesContextValue = {
  entityTypes: EntityTypeWithMetadata[] | null;
  // a record of entity type ids to their parent entity type ids, whether direct or indirect parents
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]> | null;
  // a record of entity type ids to whether they are special types or not
  isSpecialEntityTypeLookup: Record<
    VersionedUrl,
    { file: boolean; image: boolean; link: boolean }
  > | null;
  subgraph: Subgraph<EntityTypeRootType> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
