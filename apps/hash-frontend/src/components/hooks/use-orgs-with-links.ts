import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { ActorGroupEntityUuid } from "@blockprotocol/type-system";
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
import type { Org } from "../../lib/user-and-org";
import { constructOrg, isEntityOrgEntity } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of organizations, with their avatars and members populated
 */
export const useOrgsWithLinks = ({
  orgAccountGroupIds,
}: {
  orgAccountGroupIds?: ActorGroupEntityUuid[];
}): {
  loading: boolean;
  orgs?: Org[];
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
            ...(orgAccountGroupIds
              ? [
                  {
                    any: orgAccountGroupIds.map((actorGroupId) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: actorGroupId,
                        },
                      ],
                    })),
                  },
                ]
              : []),
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.organization.entityTypeId,
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
          // 1. the org's avatar (org -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
          // 2. the org's members (user <- [hasLeftEntity outgoing 1] orgMembership [hasRightEntity incoming 1] <- org)
          hasLeftEntity: { incoming: 1, outgoing: 1 },
          hasRightEntity: { incoming: 1, outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !orgAccountGroupIds || !orgAccountGroupIds.length,
  });

  const { queryEntitySubgraph: queryEntitySubgraphResponse } = data ?? {};

  const orgs = useMemo(() => {
    if (!queryEntitySubgraphResponse) {
      return undefined;
    }

    const subgraph = deserializeQueryEntitySubgraphResponse(
      queryEntitySubgraphResponse,
    ).subgraph;

    return getRoots(subgraph).map((orgEntity) => {
      if (!isEntityOrgEntity(orgEntity)) {
        throw new Error(
          `Entity with type(s) ${orgEntity.metadata.entityTypeIds.join(", ")} is not an org entity`,
        );
      }
      return constructOrg({ subgraph, orgEntity });
    });
  }, [queryEntitySubgraphResponse]);

  return {
    loading,
    orgs: orgAccountGroupIds && orgAccountGroupIds.length === 0 ? [] : orgs,
    refetch,
  };
};
