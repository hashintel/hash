import { VersionedUrl } from "@blockprotocol/type-system/dist/cjs";
import { EntityType } from "@blockprotocol/type-system/slim";
import { BaseUrl, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

import { isTypeArchived } from "../util";
import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";
import { isSpecialEntityType } from "./shared/is-special-entity-type";

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().loading;

export const useEntityTypesOptional = (params?: {
  includeArchived?: boolean;
}) => {
  const { includeArchived = false } = params ?? {};

  const { entityTypes } = useEntityTypesContextRequired();

  return includeArchived
    ? entityTypes
    : entityTypes?.filter((entityType) => !isTypeArchived(entityType));
};

export const useEntityTypesSubgraphOptional = () =>
  useEntityTypesContextRequired().subgraph;

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;

export const useLatestEntityTypesOptional = (params?: {
  includeArchived: boolean;
}) => {
  const { includeArchived = false } = params ?? {};

  const entityTypes = useEntityTypesOptional({ includeArchived });

  return useMemo(() => {
    if (!entityTypes) {
      return null;
    }

    const latestEntityTypes: Map<BaseUrl, EntityTypeWithMetadata> = new Map();

    for (const entityType of entityTypes) {
      const baseUrl = entityType.metadata.recordId.baseUrl;

      const existingEntityType = latestEntityTypes.get(baseUrl);
      if (
        !existingEntityType ||
        existingEntityType.metadata.recordId.version <
          entityType.metadata.recordId.version
      ) {
        latestEntityTypes.set(baseUrl, entityType);
      }
    }

    return Array.from(latestEntityTypes.values());
  }, [entityTypes]);
};

/**
 * Check if a specific entity type is or would be a special type, based on the provided 'allOf'
 * Specifically for use for checking types which aren't already in the db, e.g. draft or proposed types
 *
 * For types already in the db, do this instead:
 *   const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();
 *   const { isFile, isImage, isLink } = isSpecialEntityTypeLookup?.[entityType.$id] ?? {};
 */
export const useIsSpecialEntityType = (
  entityType: Pick<EntityType, "allOf"> & { $id?: EntityType["$id"] },
) => {
  const { loading, entityTypes } = useEntityTypesContextRequired();

  return useMemo(() => {
    if (loading) {
      return { isFile: false, isImage: false, isLink: false };
    }

    const typesByVersion: Record<VersionedUrl, EntityTypeWithMetadata> =
      Object.fromEntries(
        (entityTypes ?? []).map((type) => [type.schema.$id, type]),
      );

    return isSpecialEntityType(entityType, typesByVersion);
  }, [entityType, entityTypes, loading]);
};
