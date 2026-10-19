import { useApolloClient } from "@apollo/client/react";
import { useCallback } from "react";

import { splitEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";

import { graphQLErrorsAsUndefined } from "../shared/graphql-errors-as-undefined";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { GetEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolGetEntity = (): {
  getEntity: GetEntityMessageCallback;
} => {
  const apolloClient = useApolloClient();

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
      const result = await apolloClient
        .query<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>({
          query: queryEntitySubgraphQuery,
          fetchPolicy: "network-only",
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
                          equal: [
                            { path: ["draftId"] },
                            { parameter: draftId },
                          ],
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
        })
        .catch(graphQLErrorsAsUndefined);

      const response = result?.data;

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
    [apolloClient],
  );

  return { getEntity };
};
