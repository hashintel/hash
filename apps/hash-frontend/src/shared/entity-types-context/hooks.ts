import { BaseUrl, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "./hooks/use-entity-types-context-required";

export const useEntityTypesLoading = () =>
  useEntityTypesContextRequired().loading;

export const useEntityTypesOptional = () =>
  useEntityTypesContextRequired().entityTypes;

export const useEntityTypesSubgraphOptional = () =>
  useEntityTypesContextRequired().subgraph;

export const useFetchEntityTypes = () =>
  useEntityTypesContextRequired().refetch;

export const useLatestEntityTypesOptional = () => {
  const entityTypes = useEntityTypesOptional();

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
