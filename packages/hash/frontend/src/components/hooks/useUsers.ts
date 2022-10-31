import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { isEntityVertex, Subgraph } from "../../lib/subgraph";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { constructUser, User } from "../../lib/user";

export const useUsers = (): {
  loading: boolean;
  users?: User[];
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

  const users = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return undefined;
    }

    return Object.values((subgraph as unknown as Subgraph).vertices)
      .filter(isEntityVertex)
      .filter(
        ({ inner }) =>
          inner.entityTypeId === types.entityType.user.entityTypeId,
      )
      .map(({ inner: { entityId: userEntityId } }) =>
        constructUser({
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
