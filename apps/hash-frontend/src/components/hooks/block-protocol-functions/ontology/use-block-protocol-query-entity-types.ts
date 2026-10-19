import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypeSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { graphQLErrorsAsUndefined } from "../shared/graphql-errors-as-undefined";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { QueryEntityTypesMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolQueryEntityTypes = (): {
  queryEntityTypes: QueryEntityTypesMessageCallback;
} => {
  const apolloClient = useApolloClient();

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
      const response = await apolloClient
        .query<
          QueryEntityTypeSubgraphQuery,
          QueryEntityTypeSubgraphQueryVariables
        >({
          query: queryEntityTypeSubgraphQuery,
          fetchPolicy: "network-only",
          variables: {
            request: {
              filter: latestOnly
                ? { equal: [{ path: ["version"] }, { parameter: "latest" }] }
                : { all: [] },
              temporalAxes: includeArchived
                ? fullTransactionTimeAxis
                : currentTimeInstantTemporalAxes,
              graphResolveDepths: {
                ...almostFullOntologyResolveDepths,
                ...graphResolveDepths,
              },
              traversalPaths: [],
            },
          },
        })
        .catch(graphQLErrorsAsUndefined);

      if (!response?.data) {
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
    [apolloClient],
  );

  return { queryEntityTypes };
};
