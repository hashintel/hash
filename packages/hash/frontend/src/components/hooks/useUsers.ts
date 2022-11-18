import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import {
  GetAllLatestEntitiesWithMetadataQuery,
  GetAllLatestEntitiesWithMetadataQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getEntitiesWithMetadata, Subgraph } from "../../lib/subgraph";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { constructUser, User } from "../../lib/user";

export const useUsers = (): {
  loading: boolean;
  users?: User[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestEntitiesWithMetadataQuery,
    GetAllLatestEntitiesWithMetadataQueryVariables
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

  const { getAllLatestEntitiesWithMetadata: subgraph } = data ?? {};

  const users = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return undefined;
    }

    /**
     * @todo: remove casting when we start returning links in the subgraph
     *   https://app.asana.com/0/0/1203214689883095/f
     */
    return getEntitiesWithMetadata(subgraph as unknown as Subgraph)
      .filter(
        ({ entityTypeId }) =>
          entityTypeId === types.entityType.user.entityTypeId,
      )
      .map(({ entityId: userEntityId }) =>
        constructUser({
          /**
           * @todo: remove casting when we start returning links in the subgraph
           *   https://app.asana.com/0/0/1203214689883095/f
           */
          subgraph: subgraph as unknown as Subgraph,
          userEntityId,
        }),
      );
  }, [subgraph, loadingTypeSystem]);

  return {
    loading,
    users,
  };
};
