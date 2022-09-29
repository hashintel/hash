import { useMutation } from "@apollo/client";

import { useCallback } from "react";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createEntityTypeMutation } from "../../../../graphql/queries/ontology/entity-type.queries";
import { CreateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreateEntityType = (
  ownedById: string,
  readonly?: boolean,
): {
  createEntityType: CreateEntityTypeMessageCallback;
} => {
  const [createFn] = useMutation<
    CreateEntityTypeMutation,
    CreateEntityTypeMutationVariables
  >(createEntityTypeMutation);

  const createEntityType: CreateEntityTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for createEntityType",
            },
          ],
        };
      }

      const { entityType } = data;
      const { data: responseData } = await createFn({
        variables: {
          ownedById,
          entityType,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createEntityType",
            },
          ],
        };
      }

      return {
        data: {
          entityTypeVersionedUri:
            responseData.createEntityType.entityTypeVersionedUri,
          entityType: responseData.createEntityType.entityType,
        },
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createEntityType,
  };
};
