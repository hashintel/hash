import { useMutation } from "@apollo/client";

import {
  EmbedderGraphMessageCallbacks
} from "@blockprotocol/graph";
import { deleteLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkedAggregationMutation,
  DeleteLinkedAggregationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolDeleteLinkedAggregation = (): {
  deleteLinkedAggregation: EmbedderGraphMessageCallbacks["deleteLinkedAggregation"];
  deleteLinkedAggregationLoading: boolean;
  deleteLinkedAggregationError: any;
} => {
  const [
    runDeleteLinkedAggregationsMutation,
    {
      loading: deleteLinkedAggregationLoading,
      error: deleteLinkedAggregationError,
    },
  ] = useMutation<
    DeleteLinkedAggregationMutation,
    DeleteLinkedAggregationMutationVariables
  >(deleteLinkedAggregationMutation);

  const deleteLinkedAggregation: EmbedderGraphMessageCallbacks["deleteLinkedAggregation"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for createLinkedAggregation",
              },
            ],
          };
        }
      }
        const results: boolean[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          if (!action.sourceAccountId) {
            throw new Error(
              "deleteLinkedAggregation needs to be passed a sourceAccountId",
            );
          }

          const { data, errors } = await runDeleteLinkedAggregationsMutation({
            variables: {
              aggregationId: action.aggregationId,
              sourceAccountId: action.sourceAccountId,
            },
          });

          if (!data) {
            throw new Error(
              `Could not delete linked aggregation: ${errors?.[0]!.message}`,
            );
          }

          results.push(data.deleteLinkedAggregation);
        }
        return results;
      },
      [runDeleteLinkedAggregationsMutation],
    );

  return {
    deleteLinkedAggregation,
    deleteLinkedAggregationLoading,
    deleteLinkedAggregationError,
  };
};
