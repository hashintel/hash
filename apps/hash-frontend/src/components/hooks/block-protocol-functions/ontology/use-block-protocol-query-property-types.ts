import { useLazyQuery } from "@apollo/client";
import { deserializeQueryPropertyTypeSubgraphResponse } from "@local/hash-graph-sdk/property-type";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryPropertyTypeSubgraphQuery,
  QueryPropertyTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryPropertyTypeSubgraphQuery } from "../../../../graphql/queries/ontology/property-type.queries";
import type { QueryPropertyTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryPropertyTypes = (): {
  queryPropertyTypes: QueryPropertyTypesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryPropertyTypeSubgraphQuery,
    QueryPropertyTypeSubgraphQueryVariables
  >(queryPropertyTypeSubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryPropertyTypes = useCallback<QueryPropertyTypesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryPropertyTypes",
            },
          ],
        };
      }

      const { graphResolveDepths, includeArchived, latestOnly } = data;
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
              ...zeroedGraphResolveDepths,
              constrainsValuesOn: { outgoing: 255 },
              constrainsPropertiesOn: { outgoing: 255 },
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
              message: "Error calling queryPropertyTypes",
            },
          ],
        };
      }

      return {
        data: deserializeQueryPropertyTypeSubgraphResponse(
          response.data.queryPropertyTypeSubgraph,
        ).subgraph,
      };
    },
    [queryFn],
  );

  return { queryPropertyTypes };
};
