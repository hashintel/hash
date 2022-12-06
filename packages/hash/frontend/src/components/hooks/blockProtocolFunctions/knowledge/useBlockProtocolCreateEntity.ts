import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { CreateEntityMessageCallback } from "./knowledge-shim";

export const useBlockProtocolCreateEntity = (
  readonly?: boolean,
): {
  createEntity: CreateEntityMessageCallback;
} => {
  const [createFn] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const createEntity: CreateEntityMessageCallback = useCallback(
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
              message: "'data' must be provided for createEntity",
            },
          ],
        };
      }

      const { entityTypeId, ownedById, properties, linkData } = data;

      const { data: createEntityResponseData } = await createFn({
        variables: {
          entityTypeId,
          ownedById,
          properties,
          linkData,
        },
      });

      const { createEntity: createdEntity } = createEntityResponseData ?? {};

      if (!createdEntity) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createEntity",
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
    createEntity,
  };
};
