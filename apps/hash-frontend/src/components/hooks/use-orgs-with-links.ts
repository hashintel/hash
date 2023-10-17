import { ApolloQueryResult, useQuery } from "@apollo/client";
import { OrgProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { AccountGroupId, Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructOrg, Org } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of organizations, with their avatars and members populated
 */
export const useOrgsWithLinks = ({
  orgAccountGroupIds,
}: {
  orgAccountGroupIds?: AccountGroupId[];
}): {
  loading: boolean;
  orgs?: Org[];
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
            orgAccountGroupIds?.map((accountGroupId) => ({
              field: ["metadata", "recordId", "uuid"],
              operator: "EQUALS",
              value: accountGroupId,
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
      // 1. the org's avatar (org -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
      // 2. the org's members (user <- [hasLeftEntity outgoing 1] orgMembership [hasRightEntity incoming 1] <- org)
      hasLeftEntity: { incoming: 1, outgoing: 1 },
      hasRightEntity: { incoming: 1, outgoing: 1 },
    },
    fetchPolicy: "cache-and-network",
    skip: !orgAccountGroupIds || !orgAccountGroupIds.length,
  });

  const { queryEntities: subgraphAndPermissions } = data ?? {};

  const orgs = useMemo(() => {
    if (!subgraphAndPermissions) {
      return undefined;
    }

    return getRoots(subgraphAndPermissions.subgraph).map((orgEntity) =>
      constructOrg({
        subgraph: subgraphAndPermissions.subgraph,
        orgEntity: orgEntity as Entity<OrgProperties>,
      }),
    );
  }, [subgraphAndPermissions]);

  return {
    loading,
    orgs: orgAccountGroupIds && orgAccountGroupIds.length === 0 ? [] : orgs,
    refetch,
  };
};
