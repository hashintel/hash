import type { EntityTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type SpecialEntityTypeRecord = {
  isFile: boolean;
  isImage: boolean;
  isLink: boolean;
};

export type EntityTypesContextValue = {
  entityTypes: EntityTypeWithMetadata[] | null;
  // a record of entity type ids to their parent entity type ids, whether direct or indirect parents
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]> | null;
  // a record of entity type ids to whether they are special types or not
  isSpecialEntityTypeLookup: Record<
    VersionedUrl,
    SpecialEntityTypeRecord
  > | null;
  // for a given set of entityTypeIds, specify which special entity types apply to at least one of them
  includesSpecialEntityTypes:
    | null
    | ((entityTypeIds: VersionedUrl[]) => SpecialEntityTypeRecord);
  subgraph: Subgraph<EntityTypeRootType> | null;
  loading: boolean;

  refetch: () => Promise<void>;
  ensureFetched: () => void;
};
