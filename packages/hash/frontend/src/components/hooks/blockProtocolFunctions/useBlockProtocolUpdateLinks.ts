import { useMutation } from "@apollo/client";

import {
  BlockProtocolUpdateLinksMutationResults,
  BlockProtocolUpdateLinksFunction,
  BlockProtocolUpdateLinksAction,
} from "blockprotocol";

import { updateLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolUpdateLinks = (
  /** Providing accountId here saves blocks from having to know it */
  sourceAccountId: string,
): {
  updateLinks: BlockProtocolUpdateLinksFunction;
} => {
  const [runUpdateLinkedAggregationMutation] = useMutation<
    UpdateLinkedAggregationOperationMutation,
    UpdateLinkedAggregationOperationMutationVariables
  >(updateLinkedAggregationMutation);

  // @todo implement updating linkgroups and linkedentities
  const getUpdatedLinksData = useCallback(
    async (action: BlockProtocolUpdateLinksAction) => {
      if (action.updatedOperation) {
        const { data, errors } = await runUpdateLinkedAggregationMutation({
          variables: {
            ...action,
            sourceAccountId,
          },
        });

        return {
          data,
          errors,
        };
      }

      return {
        errors: [
          {
            message:
              "Action has updated operation missing. If you were trying to update linked entity, the implementation for that is currently missing",
          },
        ],
      };
    },
    [runUpdateLinkedAggregationMutation, sourceAccountId],
  );

  const updateLinks: BlockProtocolUpdateLinksFunction = useCallback(
    async (actions) => {
      const results: BlockProtocolUpdateLinksMutationResults[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        const { data, errors } = await getUpdatedLinksData(action);

        if (!data) {
          throw new Error(`Could not update link: ${errors?.[0].message}`);
        }

        // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
        results.push(
          data.updateLinkedAggregationOperation as BlockProtocolUpdateLinksMutationResults,
        );
      }
      return results;
    },
    [getUpdatedLinksData],
  );

  return {
    updateLinks,
  };
};
