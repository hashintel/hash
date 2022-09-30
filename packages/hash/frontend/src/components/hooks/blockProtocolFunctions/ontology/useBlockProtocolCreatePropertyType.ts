import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  CreatePropertyTypeMutation,
  CreatePropertyTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createPropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";
import { CreatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreatePropertyType = (
  ownedById: string,
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
        data: {
          propertyTypeId: responseData.createPropertyType.propertyTypeId,
          propertyType: responseData.createPropertyType.propertyType,
        },
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createPropertyType,
  };
};
