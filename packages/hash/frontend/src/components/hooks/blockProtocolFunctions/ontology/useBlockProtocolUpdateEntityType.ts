import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { updateEntityTypeMutation } from "../../../../graphql/queries/ontology/entity-type.queries";
import { UpdateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolUpdateEntityType = (
  readonly?: boolean,
): {
  updateEntityType: UpdateEntityTypeMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdateEntityTypeMutation,
    UpdateEntityTypeMutationVariables
  >(updateEntityTypeMutation);

  const updateEntityType: UpdateEntityTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for updateEntityType",
            },
          ],
        };
      }

      const { entityTypeId, entityType } = data;
      const { data: responseData } = await updateFn({
        variables: {
          entityTypeId,
          updatedEntityType: entityType,
        },
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
        data: {
          entityTypeId: responseData.updateEntityType.entityTypeId,
          entityType: responseData.updateEntityType.entityType,
        },
      };
    },
    [updateFn, readonly],
  );

  return {
    updateEntityType,
  };
};
