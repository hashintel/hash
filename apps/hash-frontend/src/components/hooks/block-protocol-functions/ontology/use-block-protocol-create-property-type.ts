import { useMutation } from "@apollo/client";
import { OwnedById } from "@local/hash-subgraph/src/types";
import { useCallback } from "react";

import {
  CreatePropertyTypeMutation,
  CreatePropertyTypeMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createPropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";
import { CreatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreatePropertyType = (
  ownedById: OwnedById | null,
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
