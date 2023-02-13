import { useMutation } from "@apollo/client";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { EntityId } from "@local/hash-graphql-shared/types";
import { useCallback } from "react";

import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";

export const useBlockProtocolUpdateEntity = (
  readonly?: boolean,
): {
  updateEntity: EmbedderGraphMessageCallbacks["updateEntity"];
} => {
  const [updateFn] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  // @ts-expect-error todo-0.3 fix mismatch between EntityId in @blockprotocol/graph and HASH
  const updateEntity: EmbedderGraphMessageCallbacks["updateEntity"] =
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
                message: "'data' must be provided for updateEntity",
              },
            ],
          };
        }

        const {
          entityId,
          entityTypeId,
          leftToRightOrder,
          rightToLeftOrder,
          properties,
        } = data;

        const { data: updateEntityResponseData } = await updateFn({
          variables: {
            entityId: entityId as EntityId, // @todo-0.3 consider validating that this matches the id format,
            entityTypeId,
            updatedProperties: properties,
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
