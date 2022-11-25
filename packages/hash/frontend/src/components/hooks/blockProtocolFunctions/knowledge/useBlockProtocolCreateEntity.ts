import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  CreateEntityWithMetadataMutation,
  CreateEntityWithMetadataMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createEntityWithMetadataMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { CreateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolCreateEntity = (
  readonly?: boolean,
): {
  createEntity: CreateEntityMessageCallback;
} => {
  const [createFn] = useMutation<
    CreateEntityWithMetadataMutation,
    CreateEntityWithMetadataMutationVariables
  >(createEntityWithMetadataMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const createEntityWithMetadata: CreateEntityMessageCallback = useCallback(
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
              message: "'data' must be provided for createEntityWithMetadata",
            },
          ],
        };
      }

      const { entityTypeId, properties } = data;

      const { data: createEntityResponseData } = await createFn({
        variables: {
          entityTypeId,
          properties,
        },
      });

      const { createEntityWithMetadata: createdEntity } =
        createEntityResponseData ?? {};

      if (!createdEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createEntityWithMetadata",
            },
          ],
        };
      }

      return {
        data: createdEntity,
      };
    },
    [createFn, readonly],
  );

  return {
    createEntity: createEntityWithMetadata,
  };
};
