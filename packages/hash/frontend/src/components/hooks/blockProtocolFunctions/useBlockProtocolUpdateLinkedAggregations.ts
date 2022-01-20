import { useMutation } from "@apollo/client";

import {
  BlockProtocolLinkedAggregationUpdateMutationResults,
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
        const results: BlockProtocolLinkedAggregationUpdateMutationResults[] =
          [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          const { data, errors } = await runUpdateLinkedAggregationMutation({
            variables: {
              ...action,
              sourceAccountId,
            },
          });
          if (!data) {
            throw new Error(`Could not create link: ${errors?.[0].message}`);
          }

          // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
          results.push(
            data.updateLinkedAggregationOperation as BlockProtocolLinkedAggregationUpdateMutationResults,
          );
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
