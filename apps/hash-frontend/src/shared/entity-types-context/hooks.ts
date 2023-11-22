import { VersionedUrl } from "@blockprotocol/type-system/dist/cjs";
import { EntityType } from "@blockprotocol/type-system/slim";
import { BaseUrl, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

import { isTypeArchived } from "../is-archived";
import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";
import { isSpecialEntityType } from "./shared/is-special-entity-type";

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().loading;

export const useEntityTypesOptional = () => {
  const { entityTypes } = useEntityTypesContextRequired();

  return entityTypes;
};

export const useEntityTypesSubgraphOptional = () =>
  useEntityTypesContextRequired().subgraph;

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;

export const useLatestEntityTypesOptional = (params?: {
  includeArchived: boolean;
}) => {
  const { includeArchived = false } = params ?? {};

  const { entityTypes, isSpecialEntityTypeLookup } =
    useEntityTypesContextRequired();

  const latestEntityTypes = useMemo(() => {
    if (!entityTypes) {
      return null;
    }

    const latestEntityTypesMap: Map<BaseUrl, EntityTypeWithMetadata> =
      new Map();

    for (const entityType of entityTypes) {
      const baseUrl = entityType.metadata.recordId.baseUrl;

      const existingEntityType = latestEntityTypesMap.get(baseUrl);
      if (
        !existingEntityType ||
        existingEntityType.metadata.recordId.version <
          entityType.metadata.recordId.version
      ) {
        latestEntityTypesMap.set(baseUrl, entityType);
      }
    }

    const latestEntityTypesArray = Array.from(latestEntityTypesMap.values());

    return includeArchived
      ? latestEntityTypesArray
      : latestEntityTypesArray.filter(
          (entityType) => !isTypeArchived(entityType),
        );
  }, [entityTypes, includeArchived]);

  return { latestEntityTypes, isSpecialEntityTypeLookup };
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
