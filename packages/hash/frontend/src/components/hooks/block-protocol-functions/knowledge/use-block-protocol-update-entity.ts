import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { UpdateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolUpdateEntity = (
  readonly?: boolean,
): {
  updateEntity: UpdateEntityMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const updateEntity: UpdateEntityMessageCallback = useCallback(
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
              message: "'data' must be provided for updateEntity",
            },
          ],
        };
      }

      const {
        entityId,
        entityTypeId,
        updatedProperties,
        leftToRightOrder,
        rightToLeftOrder,
      } = data;

      const { data: updateEntityResponseData } = await updateFn({
        variables: {
          entityId,
          entityTypeId,
          updatedProperties,
          leftToRightOrder,
          rightToLeftOrder,
        },
      });

      const { updateEntity: updatedEntity } = updateEntityResponseData ?? {};

      if (!updatedEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling updateEntity",
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
    updateEntity,
  };
};
