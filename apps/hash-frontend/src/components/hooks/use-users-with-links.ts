import { ApolloQueryResult, useQuery } from "@apollo/client";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountId,
  Entity,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructUser, User } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of users, with their avatars populated
 */
export const useUsersWithLinks = ({
  userAccountIds,
}: {
  userAccountIds?: AccountId[];
}): {
  loading: boolean;
  users?: User[];
  refetch: () => Promise<ApolloQueryResult<QueryEntitiesQuery>>;
} => {
  const { data, loading, refetch } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      operation: {
        multiFilter: {
          filters:
            userAccountIds?.map((accountId) => ({
              field: ["metadata", "recordId", "uuid"],
              operator: "EQUALS",
              value: accountId,
            })) ?? [],
          operator: "OR",
        },
      },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      inheritsFrom: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      // These depths are chosen to cover the following:
      // 1. the user's avatar (user -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
      // 2. the user's user memberships (user <- [hasLeftEntity outgoing 1] userMembership [hasRightEntity incoming 1] <- user)
      hasLeftEntity: { incoming: 1, outgoing: 1 },
      hasRightEntity: { incoming: 1, outgoing: 1 },
    },
    fetchPolicy: "cache-and-network",
    skip: !userAccountIds || !userAccountIds.length,
  });

  const subgraph = data?.queryEntities as Subgraph<EntityRootType> | undefined;

  const users = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    return getRoots(subgraph).map((userEntity) =>
      constructUser({
        subgraph,
        userEntity: userEntity as Entity<UserProperties>,
      }),
    );
  }, [subgraph]);

  return {
    loading,
    users: userAccountIds && userAccountIds.length === 0 ? [] : users,
    refetch,
  };
};
