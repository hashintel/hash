import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountId, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import type { User } from "../../lib/user-and-org";
import { constructUser, isEntityUserEntity } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of users, with their avatars populated
 */
export const useUsersWithLinks = ({
  userAccountIds,
  includeDrafts = false,
}: {
  userAccountIds?: AccountId[];
  includeDrafts?: boolean;
}): {
  loading: boolean;
  users?: User[];
  refetch: () => Promise<ApolloQueryResult<StructuralQueryEntitiesQuery>>;
} => {
  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            ...(userAccountIds
              ? [
                  {
                    any: userAccountIds.map((accountId) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: accountId,
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
        includeDrafts,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !userAccountIds || !userAccountIds.length,
  });

  const subgraph = data
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.structuralQueryEntities.subgraph,
      )
    : undefined;

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    return getRoots(subgraph).map((userEntity) => {
      if (!isEntityUserEntity(userEntity)) {
        throw new Error(
          `Entity with type ${userEntity.metadata.entityTypeId} is not a user entity`,
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
