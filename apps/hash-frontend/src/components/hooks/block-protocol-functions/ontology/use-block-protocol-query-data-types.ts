import { useLazyQuery } from "@apollo/client";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryDataTypeSubgraphQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import type { QueryDataTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryDataTypes = (): {
  queryDataTypes: QueryDataTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryDataTypeSubgraphQuery,
    QueryDataTypeSubgraphQueryVariables
  >(queryDataTypeSubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryDataTypes = useCallback<QueryDataTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryDataTypes",
            },
          ],
        };
      }

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const response = await queryFn({
        variables: {
          request: {
            filter: {
              all: [],
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              inheritsFrom: { outgoing: 255 },
              constrainsValuesOn: { outgoing: 255 },
            },
            traversalPaths: [],
          },
        },
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryDataTypes",
            },
          ],
        };
      }

      return {
        data: deserializeQueryDataTypeSubgraphResponse(
          response.data.queryDataTypeSubgraph,
        ).subgraph,
      };
    },
    [queryFn],
  );

  return { queryDataTypes };
};
