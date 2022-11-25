import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  UpdateEntityWithMetadataMutation,
  UpdateEntityWithMetadataMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { updateEntityWithMetadataMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { UpdateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolUpdateEntity = (
  readonly?: boolean,
): {
  updateEntity: UpdateEntityMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdateEntityWithMetadataMutation,
    UpdateEntityWithMetadataMutationVariables
  >(updateEntityWithMetadataMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const updatePersistedEntity: UpdateEntityMessageCallback = useCallback(
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
              message: "'data' must be provided for updatePersistedEntity",
            },
          ],
        };
      }

      const { entityId, updatedProperties } = data;

      const { data: updateEntityResponseData } = await updateFn({
        variables: {
          entityId,
          updatedProperties,
        },
      });

      const { updateEntityWithMetadata: updatedEntity } =
        updateEntityResponseData ?? {};

      if (!updatedEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling updateEntityWithMetadata",
            },
          ],
        };
      }

      return {
        data: updatedEntity,
      };
    },
    [updateFn, readonly],
  );

  return {
    updateEntity: updatePersistedEntity,
  };
};
