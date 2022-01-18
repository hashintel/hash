import { useMutation } from "@apollo/client";

import {
  BlockProtocolLinkedAggregation,
  BlockProtocolLinkedAggregationUpdated,
  BlockProtocolUpdateLinkedAggregationsFunction,
} from "blockprotocol";

import { updateLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolUpdateLinkedAggregations = (
  /** Providing accountId here saves blocks from having to know it */
  sourceAccountId: string,
): {
  updateLinkedAggregations: BlockProtocolUpdateLinkedAggregationsFunction;
  updateLinkedAggregationsLoading: boolean;
  updateLinkedAggregationsError: any;
} => {
  const [
    runUpdateLinkedAggregationMutation,
    {
      loading: updateLinkedAggregationsLoading,
      error: updateLinkedAggregationsError,
    },
  ] = useMutation<
    UpdateLinkedAggregationOperationMutation,
    UpdateLinkedAggregationOperationMutationVariables
  >(updateLinkedAggregationMutation);

  const updateLinkedAggregations: BlockProtocolUpdateLinkedAggregationsFunction =
    useCallback(
      async (actions) => {
        const results: BlockProtocolLinkedAggregationUpdated[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          // @todo move this cleanup code to the block
          action.updatedOperation.multiSort =
            action.updatedOperation.multiSort?.map((sort) => {
              sort.__typename = undefined;
              return sort;
            });

          action.updatedOperation.pageCount = undefined;

          action.updatedOperation.__typename = undefined;

          const { data, errors } = await runUpdateLinkedAggregationMutation({
            variables: {
              ...action,
              sourceAccountId,
            },
          });
          if (!data) {
            throw new Error(`Could not create link: ${errors?.[0].message}`);
          }

          results.push(data.updateLinkedAggregationOperation);
        }
        return results;
      },
      [sourceAccountId, runUpdateLinkedAggregationMutation],
    );

  return {
    updateLinkedAggregations,
    updateLinkedAggregationsLoading,
    updateLinkedAggregationsError,
  };
};
