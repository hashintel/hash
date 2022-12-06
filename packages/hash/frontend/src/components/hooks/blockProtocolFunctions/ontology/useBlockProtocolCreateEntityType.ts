import { useMutation } from "@apollo/client";

import { useCallback } from "react";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createEntityTypeMutation } from "../../../../graphql/queries/ontology/entity-type.queries";
import { CreateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreateEntityType = (
  ownedById: string | null,
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

      /** @todo - Can we refactor so we don't even need this? It shouldn't be reachable if not in readonly mode */
      if (!ownedById) {
        return {
          errors: [
            {
              code: "FORBIDDEN",
              message:
                "Operation can't be carried out without providing an `ownedById`",
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
        data: responseData.createEntityType,
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createEntityType,
  };
};
