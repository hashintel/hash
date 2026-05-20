import { useLazyQuery } from "@apollo/client";
import { useCallback } from "react";

import { deserializeQueryPropertyTypeSubgraphResponse } from "@local/hash-graph-sdk/property-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";

import { queryPropertyTypeSubgraphQuery } from "../../../../graphql/queries/ontology/property-type.queries";

import type {
  QueryPropertyTypeSubgraphQuery,
  QueryPropertyTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { GetPropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetPropertyType = (): {
  getPropertyType: GetPropertyTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<
    QueryPropertyTypeSubgraphQuery,
    QueryPropertyTypeSubgraphQueryVariables
  >(queryPropertyTypeSubgraphQuery, {
    /**
     * Property types are immutable, any request for an propertyTypeId should always return the same value.
     * However, currently requests for non-existent property types currently return an empty subgraph, so
     * we can't rely on this.
     *
     * @todo revert this back to cache-first once that's fixed
     */
    fetchPolicy: "network-only",
  });

  const getPropertyType = useCallback<GetPropertyTypeMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getPropertyType",
            },
          ],
        };
      }

      const { propertyTypeId, graphResolveDepths } = data;

      const response = await getFn({
        variables: {
          request: {
            filter: {
              equal: [
                { path: ["versionedUrl"] },
                { parameter: propertyTypeId },
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
      });

      if (!response.data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getPropertyType",
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
    [getFn],
  );

  return { getPropertyType };
};
