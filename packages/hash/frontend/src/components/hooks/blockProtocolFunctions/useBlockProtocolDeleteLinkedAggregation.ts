import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { deleteLinkedAggregationMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkedAggregationMutation,
  DeleteLinkedAggregationMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { parseLinkedAggregationIdentifier } from "../../../lib/entities";

export const useBlockProtocolDeleteLinkedAggregation = (): {
  deleteLinkedAggregation: EmbedderGraphMessageCallbacks["deleteLinkedAggregation"];
} => {
  const [runDeleteLinkedAggregationsMutation] = useMutation<
    DeleteLinkedAggregationMutation,
    DeleteLinkedAggregationMutationVariables
  >(deleteLinkedAggregationMutation);

  const deleteLinkedAggregation: EmbedderGraphMessageCallbacks["deleteLinkedAggregation"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for deleteLinkedAggregation",
              },
            ],
          };
        }

        const { accountId: sourceAccountId, aggregationId } =
          parseLinkedAggregationIdentifier(data.aggregationId);

        const { data: responseData } =
          await runDeleteLinkedAggregationsMutation({
            variables: {
              aggregationId,
              sourceAccountId,
            },
          });

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling deleteLinkedAggregation",
              },
            ],
          };
        }

        return {
          data: true,
        };
      },
      [runDeleteLinkedAggregationsMutation],
    );

  return {
    deleteLinkedAggregation,
  };
};
