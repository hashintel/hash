import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import type { User } from "../../lib/user-and-org";
import { constructUser, isEntityUserEntity } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of users, with their avatars populated
 */
export const useUsersWithLinks = ({
  userAccountIds,
}: {
  userAccountIds?: ActorEntityUuid[];
}): {
  loading: boolean;
  users?: User[];
  refetch: () => Promise<ApolloQueryResult<QueryEntitySubgraphQuery>>;
} => {
  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            ...(userAccountIds
              ? [
                  {
                    any: userAccountIds.map((actorId) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: actorId,
                        },
                      ],
                    })),
                  },
                ]
              : []),
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.user.entityTypeId,
              { ignoreParents: true },
            ),
          ],
        },
        graphResolveDepths: {
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 0 },
          constrainsLinksOn: { outgoing: 0 },
          constrainsLinkDestinationsOn: { outgoing: 0 },
          inheritsFrom: { outgoing: 0 },
          isOfType: { outgoing: 0 },
          // These depths are chosen to cover the following:
          // - the user's avatar (user -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
          hasLeftEntity: { incoming: 1, outgoing: 0 },
          hasRightEntity: { incoming: 0, outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !userAccountIds || !userAccountIds.length,
  });

  const subgraph = data
    ? deserializeQueryEntitySubgraphResponse(data.queryEntitySubgraph).subgraph
    : undefined;

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    return getRoots(subgraph).map((userEntity) => {
      if (!isEntityUserEntity(userEntity)) {
        throw new Error(
          `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
        );
      }

      return constructUser({ subgraph, userEntity });
    });
  }, [subgraph]);

  return {
    loading,
    users: userAccountIds && userAccountIds.length === 0 ? [] : users,
    refetch,
  };
};
