import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getPersistedEntities, Subgraph } from "../../lib/subgraph";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { Entity } from "@blockprotocol/graph";

export const useEntityTypeEntities = (
  typeId: string,
): {
  loading: boolean;
  entities?: Entity[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestPersistedEntitiesQuery,
    GetAllLatestPersistedEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 0,
      linkTypeResolveDepth: 0,
      entityTypeResolveDepth: 1,
      linkResolveDepth: 1,
      linkTargetEntityResolveDepth: 1,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const loadingTypeSystem = useInitTypeSystem();

  const { getAllLatestPersistedEntities: subgraph } = data ?? {};

  const entities = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return undefined;
    }

    /**
     * @todo: remove casting when we start returning links in the subgraph
     *   https://app.asana.com/0/0/1203214689883095/f
     */
    return getPersistedEntities(subgraph as unknown as Subgraph).filter(
      ({ entityTypeId }) => entityTypeId === typeId,
    );
  }, [subgraph, loadingTypeSystem]);

  return {
    loading,
    entities,
  };
};
