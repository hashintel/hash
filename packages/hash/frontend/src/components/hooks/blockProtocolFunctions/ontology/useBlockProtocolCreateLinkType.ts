import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  CreateLinkTypeMutation,
  CreateLinkTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { createLinkTypeMutation } from "../../../../graphql/queries/ontology/link-type.queries";
import { CreateLinkTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolCreateLinkType = (
  ownedById: string,
  readonly?: boolean,
): {
  createLinkType: CreateLinkTypeMessageCallback;
} => {
  const [createFn] = useMutation<
    CreateLinkTypeMutation,
    CreateLinkTypeMutationVariables
  >(createLinkTypeMutation);

  const createLinkType: CreateLinkTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for createLinkType",
            },
          ],
        };
      }

      const { linkType } = data;
      const { data: responseData } = await createFn({
        variables: {
          ownedById,
          linkType,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling createLinkType",
            },
          ],
        };
      }

      return {
        data: {
          linkTypeId: responseData.createLinkType.linkTypeId,
          linkType: responseData.createLinkType.linkType,
        },
      };
    },
    [ownedById, createFn, readonly],
  );

  return {
    createLinkType,
  };
};
