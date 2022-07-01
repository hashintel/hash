import { useMutation } from "@apollo/client";
import {
  EmbedderGraphMessageCallbacks
} from "@blockprotocol/graph";
import { createLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  CreateLinkedAggregationOperationMutation,
  CreateLinkedAggregationOperationMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";

export const useBlockProtocolCreateLinkedAggregation = (): {
  createLinkedAggregation: EmbedderGraphMessageCallbacks["createLinkedAggregation"];
  createLinkedAggregationLoading: boolean;
  createLinkedAggregationError: any;
} => {
  const [
    runCreateLinkedAggregationMutation,
    {
      loading: createLinkedAggregationLoading,
      error: createLinkedAggregationError,
    },
  ] = useMutation<
    CreateLinkedAggregationOperationMutation,
    CreateLinkedAggregationOperationMutationVariables
  >(createLinkedAggregationMutation);

  const createLinkedAggregation: EmbedderGraphMessageCallbacks["createLinkedAggregation"] =
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
        const results: BlockProtocolLinkedAggregation[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const action of actions) {
          if (!action.sourceAccountId) {
            throw new Error(
              "createLinkedAggregation needs to be passed a sourceAccountId",
            );
          }

          if (!action.operation.entityTypeId) {
            throw new Error(
              "entityTypeId is compulsory on operation while trying to create a linkedAggregation",
            );
          }

          const { data, errors } = await runCreateLinkedAggregationMutation({
            variables: {
              ...action,
              operation: {
                // @todo this shouldn't be necessary
                ...action.operation,
                entityTypeId: action.operation.entityTypeId,
              },
              sourceAccountId: action.sourceAccountId,
            },
          });
          if (!data) {
            throw new Error(`Could not create link: ${errors?.[0]!.message}`);
          }

          // @todo, add a proper typecheck. The GraphQL query for multiFilter { operator } returns String, but BlockProtocolLinkedAggregationUpdateMutationResults defines the exact type for operator. This typecast is used to typecast string to the one the query expects.
          results.push(
            data.createLinkedAggregation as BlockProtocolLinkedAggregation,
          );
        }
        return results;
      },
      [runCreateLinkedAggregationMutation],
    );

  return {
    createLinkedAggregation,
    createLinkedAggregationLoading,
    createLinkedAggregationError,
  };
};
