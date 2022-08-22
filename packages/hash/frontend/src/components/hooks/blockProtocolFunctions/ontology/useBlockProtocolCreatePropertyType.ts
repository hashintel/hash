import { useMutation } from "@apollo/client";
import { MessageCallback } from "@blockprotocol/core";
import { PropertyType } from "@hashintel/hash-graph-client";

import { ReadOrModifyResourceError } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  CreatePropertyTypeMutation,
  CreatePropertyTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createPropertyTypeMutation } from "../../../../graphql/queries/ontology/property-type.queries";

export type PropertyTypeResponse = {
  propertyTypeVersionedUri: string;
  propertyType: PropertyType;
};

export type PropertyTypeRequest = {
  propertyType: PropertyTypeResponse["propertyType"];
};

export type CreatePropertyTypeMessageCallback = MessageCallback<
  PropertyTypeRequest,
  null,
  PropertyTypeResponse,
  ReadOrModifyResourceError
>;

export const useBlockProtocolCreatePropertyType = (
  accountId: string,
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
              message: "'data' must be provided for createEntityType",
            },
          ],
        };
      }

      const { propertyType } = data;
      const { data: responseData } = await createFn({
        variables: {
          accountId,
          propertyType,
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
          propertyTypeVersionedUri:
            responseData.createPropertyType.propertyTypeVersionedUri,
          propertyType: responseData.createPropertyType.propertyType,
        },
      };
    },
    [accountId, createFn, readonly],
  );

  return {
    createPropertyType,
  };
};
