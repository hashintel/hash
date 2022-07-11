import { useMutation } from "@apollo/client";

import { BlockProtocolDeleteLinkedAggregationsFunction } from "blockprotocol";
import { deleteLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkedAggregationMutation,
  DeleteLinkedAggregationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolDeleteLinkedAggregations = (): {
  deleteLinkedAggregations: BlockProtocolDeleteLinkedAggregationsFunction;
  deleteLinkedAggregationsLoading: boolean;
  deleteLinkedAggregationsError: any;
} => {
  const [
    runDeleteLinkedAggregationsMutation,
    {
      loading: deleteLinkedAggregationsLoading,
      error: deleteLinkedAggregationsError,
    },
  ] = useMutation<
    DeleteLinkedAggregationMutation,
    DeleteLinkedAggregationMutationVariables
  >(deleteLinkedAggregationMutation);

  const deleteLinkedAggregations: BlockProtocolDeleteLinkedAggregationsFunction =
    useCallback(
      async (actions) => {
        const results: boolean[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          if (!action.sourceAccountId) {
            throw new Error(
              "deleteLinkedAggregations needs to be passed a sourceAccountId",
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
    deleteLinkedAggregations,
    deleteLinkedAggregationsLoading,
    deleteLinkedAggregationsError,
  };
};
