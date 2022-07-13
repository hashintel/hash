import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { updateEntityTypeMutation } from "../../../graphql/queries/entityType.queries";
import { convertApiEntityTypeToBpEntityType } from "../../../lib/entities";

export const useBlockProtocolUpdateEntityType = (): {
  updateEntityType: EmbedderGraphMessageCallbacks["updateEntityType"];
} => {
  const [runUpdateEntityTypeMutation] = useMutation<
    UpdateEntityTypeMutation,
    UpdateEntityTypeMutationVariables
  >(updateEntityTypeMutation);

  const updateEntityType: EmbedderGraphMessageCallbacks["updateEntityType"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for updateEntityType",
              },
            ],
          };
        }

        const { entityTypeId, schema } = data;

        const { data: responseData } = await runUpdateEntityTypeMutation({
          variables: { entityId: entityTypeId, schema },
        });

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling updateEntityType",
              },
            ],
          };
        }
        return {
          data: convertApiEntityTypeToBpEntityType(
            responseData.updateEntityType,
          ),
        };
      },
      [runUpdateEntityTypeMutation],
    );

  return {
    updateEntityType,
  };
};
