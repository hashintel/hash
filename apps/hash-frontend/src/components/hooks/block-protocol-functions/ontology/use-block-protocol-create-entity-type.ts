import { useMutation } from "@apollo/client";
import { OwnedById } from "@local/hash-types";
import { useCallback } from "react";

import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createEntityTypeMutation } from "../../../../graphql/queries/ontology/entity-type.queries";
import { CreateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreateEntityType = (
  ownedById: OwnedById | null,
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

      if (!ownedById) {
        throw new Error(
          "Hook was constructed without `ownedById` while not in readonly mode. Data must be created under an account.",
        );
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
        data: responseData.createEntityType,
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createEntityType,
  };
};
