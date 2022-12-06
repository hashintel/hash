import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  CreatePropertyTypeMutation,
  CreatePropertyTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createPropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";
import { CreatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreatePropertyType = (
  ownedById: string | null,
  readonly?: boolean,
): {
  createPropertyType: CreatePropertyTypeMessageCallback;
} => {
  const [createFn] = useMutation<
    CreatePropertyTypeMutation,
    CreatePropertyTypeMutationVariables
  >(createPropertyTypeMutation);

  const createPropertyType: CreatePropertyTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for createPropertyType",
            },
          ],
        };
      }

      const { propertyType } = data;
      const { data: responseData } = await createFn({
        variables: {
          ownedById,
          propertyType,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createPropertyType",
            },
          ],
        };
      }

      return {
        data: responseData.createPropertyType,
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createPropertyType,
  };
};
