import { useMutation } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import { useCallback } from "react";

import type {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createEntityTypeMutation } from "../../../../graphql/queries/ontology/entity-type.queries";
import type { CreateEntityTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreateEntityType = (
  webId: WebId | null,
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

      if (!webId) {
        throw new Error(
          "Hook was constructed without `webId` while not in readonly mode. Data must be created under an account.",
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
          webId,
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
    [webId, createFn, readonly],
  );

  return {
    createEntityType,
  };
};
