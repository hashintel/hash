import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { type EntityId, splitEntityId } from "@blockprotocol/type-system";
import {
  deserializeQueryEntitySubgraphResponse,
  type EntityPermissionsMap,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import type {
  EntityTraversalPath,
  GraphResolveDepths,
} from "@rust/hash-graph-store/types";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";

export const useEntityById = ({
  entityId,
  graphResolveDepths,
  traversalPaths,
  includePermissions = false,
  pollInterval,
}: {
  entityId: EntityId;
  graphResolveDepths: GraphResolveDepths;
  traversalPaths: EntityTraversalPath[];
  includePermissions?: boolean;
  pollInterval?: number;
}): {
  loading: boolean;
  entitySubgraph?: Subgraph<EntityRootType>;
  permissions?: EntityPermissionsMap;
} => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);
  const { data, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [{ path: ["webId"] }, { parameter: webId }],
            },
            {
              equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
            },
            ...(draftId
              ? [
                  {
                    equal: [{ path: ["draftId"] }, { parameter: draftId }],
                  },
                ]
              : []),
          ],
        },
        graphResolveDepths,
        traversalPaths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: !!draftId,
        includePermissions,
      },
    },
    fetchPolicy: "cache-and-network",
    pollInterval,
  });

  return useMemo(() => {
    const response = data
      ? deserializeQueryEntitySubgraphResponse(data.queryEntitySubgraph)
      : undefined;

    return {
      loading,
      entitySubgraph: response?.subgraph,
      permissions: response?.entityPermissions,
    };
  }, [loading, data]);
};
