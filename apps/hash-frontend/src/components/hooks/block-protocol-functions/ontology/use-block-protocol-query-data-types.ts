import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypeSubgraphQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import { graphQLErrorsAsUndefined } from "../shared/graphql-errors-as-undefined";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { QueryDataTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryDataTypes = (): {
  queryDataTypes: QueryDataTypesMessageCallback;
} => {
  const apolloClient = useApolloClient();

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
      const response = await apolloClient
        .query<QueryDataTypeSubgraphQuery, QueryDataTypeSubgraphQueryVariables>(
          {
            query: queryDataTypeSubgraphQuery,
            fetchPolicy: "network-only",
            variables: {
              request: {
                filter: {
                  all: [],
                },
                temporalAxes: currentTimeInstantTemporalAxes,
                graphResolveDepths: almostFullOntologyResolveDepths,
                traversalPaths: [],
              },
            },
          },
        )
        .catch(graphQLErrorsAsUndefined);

      if (!response?.data) {
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
    [apolloClient],
  );

  return { queryDataTypes };
};
