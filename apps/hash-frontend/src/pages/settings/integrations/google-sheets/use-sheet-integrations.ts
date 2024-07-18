import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";

export type UseSheetsFlows = {
  flows: [];
  loading: boolean;
  refetch: () => void;
};

export const useSheetsFlows = (): UseSheetsFlows => {
  // const { authenticatedUser } = useAuthenticatedUser();

  const { loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
        filter: {
          all: [
            // @todo query for Sheets-related Flow definitions / runs instead (depending on what this UI becomes)
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: { incoming: 0, outgoing: 1 },
          hasLeftEntity: { incoming: 1, outgoing: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
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
