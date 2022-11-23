import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  GetAllLatestEntitiesWithMetadataQuery,
  GetAllLatestEntitiesWithMetadataQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesWithMetadataQuery } from "../../graphql/queries/knowledge/entity.queries";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { constructHashInstance, HashInstance } from "../../lib/hashInstance";

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: HashInstance;
} => {
  /**
   * @todo: use aggregate entity query instead so that all entities don't have to
   * be fetched to get the HASH instance entity.
   */
  const { data, loading } = useQuery<
    GetAllLatestEntitiesWithMetadataQuery,
    GetAllLatestEntitiesWithMetadataQueryVariables
  >(getAllLatestEntitiesWithMetadataQuery, {
    variables: {
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 0,
      entityTypeResolveDepth: 0,
      entityResolveDepth: 1,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const loadingTypeSystem = useInitTypeSystem();

  const { getAllLatestEntitiesWithMetadata: subgraph } = data ?? {};

  const hashInstance = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return undefined;
    }

    const hashInstanceEditionId = getRootsAsEntities(subgraph).find(
      ({ metadata: { entityTypeId } }) =>
        entityTypeId === types.entityType.hashInstance.entityTypeId,
    )?.metadata.editionId;

    if (!hashInstanceEditionId) {
      throw new Error(
        "A HASH Instance entity could not be found in the subgraph.",
      );
    }

    return constructHashInstance({
      subgraph,
      hashInstanceEditionId,
    });
  }, [subgraph, loadingTypeSystem]);

  return {
    loading,
    hashInstance,
  };
};
