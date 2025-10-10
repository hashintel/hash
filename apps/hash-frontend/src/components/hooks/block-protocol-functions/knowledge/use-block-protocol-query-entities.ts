import { useLazyQuery } from "@apollo/client";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { convertBpFilterToGraphFilter } from "@local/hash-graph-sdk/filter";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import type { QueryEntitiesMessageCallback } from "./knowledge-shim";

export const useBlockProtocolQueryEntities = (): {
  queryEntities: QueryEntitiesMessageCallback;
} => {
  const [queryFn] = useLazyQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const queryEntities = useCallback<QueryEntitiesMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for queryEntities",
            },
          ],
        };
      }

      const { operation, ...additionalParams } = data;

      if (operation.multiSort !== undefined && operation.multiSort !== null) {
        throw new Error(
          "Sorting on queryEntities results is not currently supported",
        );
      }

      /**
       * @todo Add filtering to this query using structural querying.
       *   This may mean having the backend use structural querying and relaying
       *   or doing it from here.
       * @see https://linear.app/hash/issue/H-2998
       */
      const { data: response } = await queryFn({
        variables: {
          request: {
            filter: operation.multiFilter
              ? convertBpFilterToGraphFilter(operation.multiFilter)
              : { any: [] },
            ...additionalParams,
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: false,
            includePermissions: false,
          },
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling queryEntities",
            },
          ],
        };
      }

      const subgraph = deserializeQueryEntitySubgraphResponse(
        response.queryEntitySubgraph,
      ).subgraph;

      return { data: { results: subgraph, operation } };
    },
    [queryFn],
  );

  return { queryEntities };
};
