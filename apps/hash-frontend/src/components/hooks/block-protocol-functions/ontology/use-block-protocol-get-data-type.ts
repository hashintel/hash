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
import type { GetDataTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetDataType = (): {
  getDataType: GetDataTypeMessageCallback;
} => {
  const apolloClient = useApolloClient();

  const getDataType = useCallback<GetDataTypeMessageCallback>(
    async ({ data: dataTypeId }) => {
      if (!dataTypeId) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getDataType",
            },
          ],
        };
      }

      const response = await apolloClient
        .query<QueryDataTypeSubgraphQuery, QueryDataTypeSubgraphQueryVariables>(
          {
            query: queryDataTypeSubgraphQuery,
            // Data types are immutable, any request for an dataTypeId should always return the same value.
            fetchPolicy: "cache-first",
            variables: {
              request: {
                filter: {
                  equal: [
                    { path: ["versionedUrl"] },
                    { parameter: dataTypeId },
                  ],
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
              message: "Error calling getDataType",
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

  return { getDataType };
};
