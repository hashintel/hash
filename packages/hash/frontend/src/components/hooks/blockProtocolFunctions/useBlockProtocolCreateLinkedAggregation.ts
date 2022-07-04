import { useMutation } from "@apollo/client";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { createLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  CreateLinkedAggregationOperationMutation,
  CreateLinkedAggregationOperationMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  convertApiLinkedAggregationToBpLinkedAggregation,
  parseEntityIdentifier,
} from "../../../lib/entities";

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

        const {
          sourceEntityId: bpFormattedSourceEntityId,
          operation,
          path,
        } = data;

        const { accountId: sourceAccountId, entityId: sourceEntityId } =
          parseEntityIdentifier(bpFormattedSourceEntityId);

        const { data: responseData } = await runCreateLinkedAggregationMutation(
          {
            variables: {
              operation,
              path,
              sourceAccountId,
              sourceEntityId,
            },
          },
        );

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling createLinkedAggregation",
              },
            ],
          };
        }

        return {
          data: convertApiLinkedAggregationToBpLinkedAggregation(
            responseData.createLinkedAggregation,
          ),
        };
      },
      [runCreateLinkedAggregationMutation],
    );

  return {
    createLinkedAggregation,
    createLinkedAggregationLoading,
    createLinkedAggregationError,
  };
};
