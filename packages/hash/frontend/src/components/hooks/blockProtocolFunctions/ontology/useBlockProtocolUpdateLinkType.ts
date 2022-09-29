import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  UpdateLinkTypeMutation,
  UpdateLinkTypeMutationVariables,
} from "../../../../graphql/apiTypes.gen";
import { updateLinkTypeMutation } from "../../../../graphql/queries/ontology/link-type.queries";
import { UpdateLinkTypeMessageCallback } from "./ontology-types-shim";

export const useBlockProtocolUpdateLinkType = (
  readonly?: boolean,
): {
  updateLinkType: UpdateLinkTypeMessageCallback;
} => {
  const [updateFn] = useMutation<
    UpdateLinkTypeMutation,
    UpdateLinkTypeMutationVariables
  >(updateLinkTypeMutation);

  const updateLinkType: UpdateLinkTypeMessageCallback = useCallback(
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
              message: "'data' must be provided for updateLinkType",
            },
          ],
        };
      }

      const { linkTypeVersionedUri, linkType } = data;
      const { data: responseData } = await updateFn({
        variables: {
          linkTypeVersionedUri,
          updatedLinkType: linkType,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling updateLinkType",
            },
          ],
        };
      }

      return {
        data: {
          linkTypeVersionedUri:
            responseData.updateLinkType.linkTypeVersionedUri,
          linkType: responseData.updateLinkType.linkType,
        },
      };
    },
    [updateFn, readonly],
  );

  return {
    updateLinkType,
  };
};
