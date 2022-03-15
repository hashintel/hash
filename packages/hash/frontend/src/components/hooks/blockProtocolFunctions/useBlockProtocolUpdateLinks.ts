import { useMutation } from "@apollo/client";

import {
  BlockProtocolUpdateLinksFunction,
  BlockProtocolUpdateLinksAction,
  BlockProtocolLink,
} from "blockprotocol";

import { updateLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolUpdateLinks = (): {
  updateLinks: BlockProtocolUpdateLinksFunction;
} => {
  const [runUpdateLinkedAggregationMutation] = useMutation<
    UpdateLinkedAggregationOperationMutation,
    UpdateLinkedAggregationOperationMutationVariables
  >(updateLinkedAggregationMutation);

  const getUpdatedLinksData = useCallback(
    async (action: BlockProtocolUpdateLinksAction) => {
      // @todo implement updating linkgroups and linkedentities
      if ("linkId" in action) {
        throw new Error(
          "Updating single links via linkId not yet implemented.",
        );
      }
      if (action.data && action.sourceAccountId) {
        if (action.data.entityTypeId == null) {
          // @todo we should allow aggregating without narrowing the type
          throw new Error("An aggregation operation must have an entityTypeId");
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
    [runUpdateLinkedAggregationMutation],
  );

  const updateLinks: BlockProtocolUpdateLinksFunction = useCallback(
    async (actions) => {
      const results: BlockProtocolLink[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        const { data, errors } = await getUpdatedLinksData(action);

        if (!data) {
          throw new Error(`Could not update link: ${errors?.[0].message}`);
        }

        // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
        results.push(
          data.updateLinkedAggregationOperation as unknown as BlockProtocolLink,
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
