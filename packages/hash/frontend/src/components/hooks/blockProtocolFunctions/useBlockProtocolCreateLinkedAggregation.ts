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

export const useBlockProtocolCreateLinkedAggregation = (
  readonly?: boolean,
): {
  createLinkedAggregation: EmbedderGraphMessageCallbacks["createLinkedAggregation"];
} => {
  const [runCreateLinkedAggregationMutation] = useMutation<
    CreateLinkedAggregationOperationMutation,
    CreateLinkedAggregationOperationMutationVariables
  >(createLinkedAggregationMutation);

  const createLinkedAggregation: EmbedderGraphMessageCallbacks["createLinkedAggregation"] =
    useCallback(
      async ({ data }) => {
        if (readonly) {
          return {
            errors: [
              {
                code: "FORBIDDEN",
                message: "Operation can't be carried out in readonly mode",
              },
            ],
          };
        }

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
      [runCreateLinkedAggregationMutation, readonly],
    );

  return {
    createLinkedAggregation,
  };
};
