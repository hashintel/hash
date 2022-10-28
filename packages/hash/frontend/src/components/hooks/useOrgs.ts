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
import { constructOrg, Org } from "../../lib/org";
/**
 * Retrieves a list of organizations.
 * @todo the API should provide this, and it should only be available to admins.
 *    users should only see a list of orgs they are a member of.
 */
export const useOrgs = (): {
  loading: boolean;
  orgs: Org[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestPersistedEntitiesQuery,
    GetAllLatestPersistedEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const loadingTypeSystem = useInitTypeSystem();

  const { getAllLatestPersistedEntities: subgraph } = data ?? {};

  const orgs = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return [];
    }

    return Object.values((subgraph as unknown as Subgraph).vertices)
      .filter(isEntityVertex)
      .filter(
        ({ inner }) => inner.entityTypeId === types.entityType.org.entityTypeId,
      )
      .map(({ inner: { entityId: orgEntityId } }) =>
        constructOrg({
          subgraph: subgraph as unknown as Subgraph,
          orgEntityId,
        }),
      );
  }, [subgraph, loadingTypeSystem]);

  return {
    loading,
    orgs,
  };
};
