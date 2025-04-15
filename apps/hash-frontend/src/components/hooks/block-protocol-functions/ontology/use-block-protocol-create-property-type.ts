import { useMutation } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import { useCallback } from "react";

import type {
  CreatePropertyTypeMutation,
  CreatePropertyTypeMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createPropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";
import type { CreatePropertyTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreatePropertyType = (
  webId: WebId | null,
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
              message: "'data' must be provided for createPropertyType",
            },
          ],
        };
      }

      const { propertyType } = data;
      const { data: responseData } = await createFn({
        variables: {
          webId,
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
    [webId, createFn, readonly],
  );

  return {
    createPropertyType,
  };
};
