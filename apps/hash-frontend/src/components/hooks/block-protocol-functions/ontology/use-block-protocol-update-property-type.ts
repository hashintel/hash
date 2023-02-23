import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  UpdatePropertyTypeMutation,
  UpdatePropertyTypeMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updatePropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";
import { UpdatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolUpdatePropertyType = (
  readonly?: boolean,
): {
  updatePropertyType: UpdatePropertyTypeMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdatePropertyTypeMutation,
    UpdatePropertyTypeMutationVariables
  >(updatePropertyTypeMutation);

  const updatePropertyType: UpdatePropertyTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for updatePropertyType",
            },
          ],
        };
      }

      const { propertyTypeId, propertyType } = data;
      const { data: responseData } = await updateFn({
        variables: {
          propertyTypeId,
          updatedPropertyType: {
            ...propertyType,
            kind: "propertyType",
          },
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling updatePropertyType",
            },
          ],
        };
      }

      return {
        data: responseData.updatePropertyType,
      };
    },
    [updateFn, readonly],
  );

  return {
    updatePropertyType,
  };
};
