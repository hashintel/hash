import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  GetAllLatestEntitiesQuery,
  GetAllLatestEntitiesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
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
    GetAllLatestEntitiesQuery,
    GetAllLatestEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      constrainsValuesOn: 0,
      propertyTypeResolveDepth: 0,
      entityTypeResolveDepth: 0,
      entityResolveDepth: 1,
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const { getAllLatestEntities: subgraph } = data ?? {};

  const orgs = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    // Sharing the same resolved map makes the map below slightly more efficient
    const resolvedUsers = {};
    const resolvedOrgs = {};

    /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
    return getRoots(subgraph as Subgraph<SubgraphRootTypes["entity"]>)
      .filter(
        ({ metadata: { entityTypeId } }) =>
          entityTypeId === types.entityType.org.entityTypeId,
      )
      .map(({ metadata: { editionId } }) =>
        constructOrg({
          subgraph,
          orgEntityEditionId: editionId,
          resolvedUsers,
          resolvedOrgs,
        }),
      );
  }, [subgraph]);

  return {
    loading,
    orgs,
  };
};
