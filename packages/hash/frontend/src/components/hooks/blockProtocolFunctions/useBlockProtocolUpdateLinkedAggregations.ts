import { useMutation } from "@apollo/client";

import {
  BlockProtocolUpdateLinkedAggregationsFunction,
  BlockProtocolLinkedAggregation,
} from "blockprotocol";

import { updateLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolUpdateLinkedAggregations = (): {
  updateLinkedAggregations: BlockProtocolUpdateLinkedAggregationsFunction;
} => {
  const [runUpdateLinkedAggregationMutation] = useMutation<
    UpdateLinkedAggregationOperationMutation,
    UpdateLinkedAggregationOperationMutationVariables
  >(updateLinkedAggregationMutation);

  const updateLinkedAggregations: BlockProtocolUpdateLinkedAggregationsFunction =
    useCallback(
      async (actions) => {
        const results: BlockProtocolLinkedAggregation[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          if (action.data.entityTypeId == null) {
            // @todo we should allow aggregating without narrowing the type
            throw new Error(
              "An aggregation operation must have an entityTypeId",
            );
          }

          if (!action.sourceAccountId) {
            throw new Error(
              "updateLinkedAggregations needs to be passed a sourceAccountId",
            );
          }

          const { data, errors } = await runUpdateLinkedAggregationMutation({
            variables: {
              ...action,
              updatedOperation: {
                // @todo this shouldn't be necessary
                ...action.data,
                entityTypeId: action.data.entityTypeId,
              },
              sourceAccountId: action.sourceAccountId,
            },
          });

          if (!data) {
            throw new Error(`Could not update link: ${errors?.[0]!.message}`);
          }

          // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
          results.push(
            data.updateLinkedAggregationOperation as BlockProtocolLinkedAggregation,
          );
        }
        return results;
      },
      [runUpdateLinkedAggregationMutation],
    );

  return {
    updateLinkedAggregations,
  };
};
