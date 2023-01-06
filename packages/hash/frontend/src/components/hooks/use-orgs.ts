import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/ontology-types";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useMemo } from "react";

import {
  GetAllLatestEntitiesQuery,
  GetAllLatestEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructOrg, Org } from "../../lib/user-and-org";
/**
 * Retrieves a list of organizations.
 * @todo the API should provide this, and it should only be available to admins.
 *    users should only see a list of orgs they are a member of.
 */
export const useOrgs = (
  cache = false,
): {
  loading: boolean;
  orgs?: Org[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestEntitiesQuery,
    GetAllLatestEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      rootEntityTypeIds: [types.entityType.org.entityTypeId],
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { incoming: 1, outgoing: 1 },
      hasRightEntity: { incoming: 1, outgoing: 1 },
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: cache ? "cache-first" : "no-cache",
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
    return getRoots(subgraph as Subgraph<SubgraphRootTypes["entity"]>).map(
      (orgEntity) =>
        constructOrg({
          subgraph,
          orgEntity,
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
