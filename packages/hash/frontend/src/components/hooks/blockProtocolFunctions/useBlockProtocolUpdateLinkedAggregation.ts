import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";

import { updateLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  UpdateLinkedAggregationOperationMutation,
  UpdateLinkedAggregationOperationMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  convertApiLinkedAggregationToBpLinkedAggregation,
  parseLinkedAggregationIdentifier,
} from "../../../lib/entities";

export const useBlockProtocolUpdateLinkedAggregation = (): {
  updateLinkedAggregation: EmbedderGraphMessageCallbacks["updateLinkedAggregation"];
} => {
  const [runUpdateLinkedAggregationMutation] = useMutation<
    UpdateLinkedAggregationOperationMutation,
    UpdateLinkedAggregationOperationMutationVariables
  >(updateLinkedAggregationMutation);

  const updateLinkedAggregation: EmbedderGraphMessageCallbacks["updateLinkedAggregation"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for updateLinkedAggregation",
              },
            ],
          };
        }

        const { accountId: sourceAccountId, aggregationId } =
          parseLinkedAggregationIdentifier(data.aggregationId);

        const { data: responseData } = await runUpdateLinkedAggregationMutation(
          {
            variables: {
              aggregationId,
              sourceAccountId,
              updatedOperation: data.operation,
            },
          },
        );

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling updateLinkedAggregation",
              },
            ],
          };
        }

        return {
          data: convertApiLinkedAggregationToBpLinkedAggregation(
            responseData.updateLinkedAggregationOperation,
          ),
        };
      },
      [runUpdateLinkedAggregationMutation],
    );

  return {
    updateLinkedAggregation,
  };
};
