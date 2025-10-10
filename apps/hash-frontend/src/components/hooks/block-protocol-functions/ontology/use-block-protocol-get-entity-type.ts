import { useLazyQuery } from "@apollo/client";
import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntityTypeSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import type { GetEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetEntityType = (): {
  getEntityType: GetEntityTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<
    QueryEntityTypeSubgraphQuery,
    QueryEntityTypeSubgraphQueryVariables
  >(queryEntityTypeSubgraphQuery, {
    /**
     * Entity types are immutable, any request for an entityTypeId should always return the same value.
     * However, currently requests for non-existent entity types currently return an empty subgraph, so
     * we can't rely on this.
     *
     * @todo revert this back to cache-first once that's fixed
     */
    fetchPolicy: "network-only",
  });

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

      const response = await getFn({
        query: queryEntityTypeSubgraphQuery,
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...fullOntologyResolveDepths,
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
    [getFn],
  );

  return { getEntityType };
};
