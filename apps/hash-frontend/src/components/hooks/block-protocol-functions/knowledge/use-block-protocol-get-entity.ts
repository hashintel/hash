import { useLazyQuery } from "@apollo/client";
import { splitEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { useCallback } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const [queryEntitySubgraphFn] = useLazyQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const getEntity = useCallback<GetEntityMessageCallback>(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for getEntity",
            },
          ],
        };
      }

      const { entityId, ...additionalParams } = data;

      const [webId, entityUuid, draftId] = splitEntityId(entityId);
      const { data: response } = await queryEntitySubgraphFn({
        variables: {
          request: {
            filter: {
              all: [
                {
                  equal: [{ path: ["webId"] }, { parameter: webId }],
                },
                {
                  equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
                },
                ...(draftId
                  ? [
                      {
                        equal: [{ path: ["draftId"] }, { parameter: draftId }],
                      },
                    ]
                  : []),
              ],
            },
            ...additionalParams,
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: !!draftId,
            includePermissions: false,
          },
        },
      });

      if (!response) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling getEntity",
            },
          ],
        };
      }

      return {
        data: deserializeQueryEntitySubgraphResponse(
          response.queryEntitySubgraph,
        ).subgraph,
      };
    },
    [queryEntitySubgraphFn],
  );

  return { getEntity };
};
