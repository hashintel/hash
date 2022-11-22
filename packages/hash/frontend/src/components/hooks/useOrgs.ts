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

  const orgs = useMemo(() => {
    if (!subgraph || loadingTypeSystem) {
      return undefined;
    }

    /**
     * @todo: remove casting when we start returning links in the subgraph
     *   https://app.asana.com/0/0/1203214689883095/f
     */
    return getRootsAsEntities(subgraph)
      .filter(
        ({ metadata: { entityTypeId } }) =>
          entityTypeId === types.entityType.org.entityTypeId,
      )
      .map(({ metadata: { editionId: orgEntityEditionId } }) =>
        constructOrg({
          subgraph,
          orgEntityEditionId,
        }),
      );
  }, [subgraph, loadingTypeSystem]);

  return {
    loading,
    orgs,
  };
};
