import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypeSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { graphQLErrorsAsUndefined } from "../shared/graphql-errors-as-undefined";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { GetEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetEntityType = (): {
  getEntityType: GetEntityTypeMessageCallback;
} => {
  const apolloClient = useApolloClient();

  const getEntityType = useCallback<GetEntityTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntityType",
            },
          ],
        };
      }

      const { entityTypeId, graphResolveDepths } = data;

      const response = await apolloClient
        .query<
          QueryEntityTypeSubgraphQuery,
          QueryEntityTypeSubgraphQueryVariables
        >({
          query: queryEntityTypeSubgraphQuery,
          /**
           * Entity types are immutable, any request for an entityTypeId should always return the same value.
           * However, currently requests for non-existent entity types currently return an empty subgraph, so
           * we can't rely on this.
           *
           * @todo revert this back to cache-first once that's fixed
           */
          fetchPolicy: "network-only",
          variables: {
            request: {
              filter: {
                equal: [
                  { path: ["versionedUrl"] },
                  { parameter: entityTypeId },
                ],
              },
              temporalAxes: currentTimeInstantTemporalAxes,
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
              message: "Error calling getEntityType",
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

  return { getEntityType };
};
