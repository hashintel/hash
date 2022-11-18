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
import { constructOrg, Org } from "../../lib/org";
/**
 * Retrieves a list of organizations.
 * @todo the API should provide this, and it should only be available to admins.
 *    users should only see a list of orgs they are a member of.
 */
export const useOrgs = (): {
  loading: boolean;
  orgs?: Org[];
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

  const orgs = useMemo(() => {
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
          entityTypeId === types.entityType.org.entityTypeId,
      )
      .map(({ entityId: orgEntityId }) =>
        constructOrg({
          /**
           * @todo: remove this when we start returning links in the subgraph
           *   https://app.asana.com/0/0/1203214689883095/f
           */
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
