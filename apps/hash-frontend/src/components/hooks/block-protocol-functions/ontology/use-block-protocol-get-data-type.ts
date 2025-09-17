import { useLazyQuery } from "@apollo/client";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback } from "react";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryDataTypeSubgraphQuery } from "../../../../graphql/queries/ontology/data-type.queries";
import type { GetDataTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolGetDataType = (): {
  getDataType: GetDataTypeMessageCallback;
} => {
  const [getFn] = useLazyQuery<
    QueryDataTypeSubgraphQuery,
    QueryDataTypeSubgraphQueryVariables
  >(queryDataTypeSubgraphQuery, {
    // Data types are immutable, any request for an dataTypeId should always return the same value.
    fetchPolicy: "cache-first",
  });

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

      const response = await getFn({
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              constrainsValuesOn: { outgoing: 255 },
            },
          },
        },
      });

      if (!response.data) {
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
    [getFn],
  );

  return { getDataType };
};
