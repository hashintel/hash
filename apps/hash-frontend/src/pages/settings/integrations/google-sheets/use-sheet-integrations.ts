import { useQuery } from "@apollo/client";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";

export type UseSheetsFlows = {
  flows: [];
  loading: boolean;
  refetch: () => void;
};

export const useSheetsFlows = (): UseSheetsFlows => {
  // const { authenticatedUser } = useAuthenticatedUser();

  const { loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            // @todo query for Sheets-related Flow definitions / runs instead (depending on what this UI becomes)
          ],
        },
        traversalPaths: [
          {
            edges: [
              { kind: "has-right-entity", direction: "incoming" },
              { kind: "has-left-entity", direction: "outgoing" },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    // @todo make this !authenticatedUser once re-implemented
    skip: true,
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    return {
      flows: [],
      loading,
      refetch,
    };
  }, [loading, refetch]);
};
