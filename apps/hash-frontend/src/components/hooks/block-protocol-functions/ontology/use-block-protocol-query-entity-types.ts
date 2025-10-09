import { useLazyQuery } from "@apollo/client";
import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import {
  currentTimeInstantTemporalAxes,
  fullGraphResolveDepths,
  fullTransactionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntityTypeSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import type { QueryEntityTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryEntityTypes = (): {
  queryEntityTypes: QueryEntityTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryEntityTypeSubgraphQuery,
    QueryEntityTypeSubgraphQueryVariables
  >(queryEntityTypeSubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryEntityTypes = useCallback<QueryEntityTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryEntityTypes",
            },
          ],
        };
      }

      const { graphResolveDepths, latestOnly, includeArchived } = data;

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const response = await queryFn({
        variables: {
          request: {
            filter: latestOnly
              ? { equal: [{ path: ["version"] }, { parameter: "latest" }] }
              : { all: [] },
            temporalAxes: includeArchived
              ? fullTransactionTimeAxis
              : currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...fullGraphResolveDepths,
              ...graphResolveDepths,
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
              message: "Error calling queryEntityTypes",
            },
          ],
        };
      }

      return {
        data: deserializeQueryEntityTypeSubgraphResponse(
          response.data.queryEntityTypeSubgraph,
        ).subgraph,
      };
    },
    [queryFn],
  );

  return { queryEntityTypes };
};
