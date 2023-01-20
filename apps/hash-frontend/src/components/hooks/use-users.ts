import { useQuery } from "@apollo/client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import { useMemo } from "react";

import {
  GetAllLatestEntitiesQuery,
  GetAllLatestEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructUser, User } from "../../lib/user-and-org";

export const useUsers = (
  cache = false,
): {
  loading: boolean;
  users?: User[];
} => {
  const { data, loading } = useQuery<
    GetAllLatestEntitiesQuery,
    GetAllLatestEntitiesQueryVariables
  >(getAllLatestEntitiesQuery, {
    variables: {
      rootEntityTypeIds: [types.entityType.user.entityTypeId],
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

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    // Sharing the same resolved map makes the map below slightly more efficient
    const resolvedUsers = {};
    const resolvedOrgs = {};

    /** @todo - Is there a way we can ergonomically encode this in the GraphQL type? */
    return getRoots(subgraph as Subgraph<SubgraphRootTypes["entity"]>).map(
      (userEntity) =>
        constructUser({
          subgraph,
          userEntity,
          resolvedUsers,
          resolvedOrgs,
        }),
    );
  }, [subgraph]);

  return {
    loading,
    users,
  };
};
