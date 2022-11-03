import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { constructMinimalOrg, MinimalOrg } from "../../lib/org";
import { constructMinimalUser, MinimalUser } from "../../lib/user";
import {
  GetAllLatestPersistedEntitiesQuery,
  GetAllLatestPersistedEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { isEntityVertex, Subgraph } from "../../lib/subgraph";
import { useInitTypeSystem } from "../../lib/use-init-type-system";

export const useAccounts = (): {
  loading: boolean;
  accounts?: (MinimalOrg | MinimalUser)[];
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

  const accounts = useMemo(() => {
    if (!data || loadingTypeSystem) {
      return undefined;
    }

    const subgraph = data.getAllLatestPersistedEntities as unknown as Subgraph;

    return Object.values(subgraph.vertices)
      .filter(isEntityVertex)
      .filter(
        ({ inner }) =>
          inner.entityTypeId === types.entityType.user.entityTypeId ||
          inner.entityTypeId === types.entityType.org.entityTypeId,
      )
      .map(({ inner: { entityId, entityTypeId } }) =>
        entityTypeId === types.entityType.org.entityTypeId
          ? constructMinimalOrg({ subgraph, orgEntityId: entityId })
          : constructMinimalUser({
              subgraph,
              userEntityId: entityId,
            }),
      );
  }, [data, loadingTypeSystem]);

  return { accounts, loading };
};
