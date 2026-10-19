import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { convertBpFilterToGraphFilter } from "@local/hash-graph-sdk/filter";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { graphQLErrorsAsUndefined } from "../shared/graphql-errors-as-undefined";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { QueryEntitiesMessageCallback } from "./knowledge-shim";

export const useBlockProtocolQueryEntities = (): {
  queryEntities: QueryEntitiesMessageCallback;
} => {
  const apolloClient = useApolloClient();

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
      const result = await apolloClient
        .query<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>({
          query: queryEntitySubgraphQuery,
          fetchPolicy: "network-only",
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
        })
        .catch(graphQLErrorsAsUndefined);

      const response = result?.data;

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
    [apolloClient],
  );

  return { queryEntities };
};
