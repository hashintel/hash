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
        traversalPaths: [
          {
            // 1. the org's avatar (org -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
            edges: [
              {
                kind: "has-left-entity",
                direction: "incoming",
              },
              {
                kind: "has-right-entity",
                direction: "outgoing",
              },
            ],
          },
          {
            // 2. the org's members (user <- [hasLeftEntity outgoing 1] orgMembership [hasRightEntity incoming 1] <- org)
            edges: [
              {
                kind: "has-right-entity",
                direction: "incoming",
              },
              {
                kind: "has-left-entity",
                direction: "outgoing",
              },
            ],
          },
        ],
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
    if (orgAccountGroupIds?.length === 0) {
      return [];
    }

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
  }, [orgAccountGroupIds, queryEntitySubgraphResponse]);

  return {
    loading,
    orgs,
    refetch,
  };
};
