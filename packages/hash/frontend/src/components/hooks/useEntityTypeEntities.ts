import { useQuery } from "@apollo/client";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { Subgraph } from "../../lib/subgraph";

export const useEntityTypeEntities = (
  entityTypeId: string,
): {
  loading: boolean;
  subgraph?: Subgraph;
} => {
  const { data, loading } = useQuery<
    GetAllLatestPersistedEntitiesQuery,
    GetAllLatestPersistedEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      entityTypeId,
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 1,
      linkTypeResolveDepth: 0,
      entityTypeResolveDepth: 1,
      linkResolveDepth: 0,
      linkTargetEntityResolveDepth: 0,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const { getAllLatestPersistedEntities: subgraph } = data ?? {};

  return {
    loading,
    /**
     * @todo: remove casting when we start returning links in the subgraph
     *   https://app.asana.com/0/0/1203214689883095/f
     */
    subgraph: subgraph as unknown as Subgraph,
  };
};
