import { useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { deleteLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkMutation,
  DeleteLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { parseLinkIdentifier } from "../../../lib/entities";

export const useBlockProtocolDeleteLink = (
  readonly?: boolean,
): {
  deleteLink: EmbedderGraphMessageCallbacks["deleteLink"];
} => {
  const [runDeleteLinkMutation] = useMutation<
    DeleteLinkMutation,
    DeleteLinkMutationVariables
  >(deleteLinkMutation);

  const deleteLink: EmbedderGraphMessageCallbacks["deleteLink"] = useCallback(
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
              message: "'data' must be provided for deleteLink",
            },
          ],
        };
      }

      const { accountId: sourceAccountId, linkId } = parseLinkIdentifier(
        data.linkId,
      );

      const { data: responseData } = await runDeleteLinkMutation({
        variables: {
          linkId,
          sourceAccountId,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling deleteLink",
            },
          ],
        };
      }

      return {
        data: true,
      };
    },
    [runDeleteLinkMutation, readonly],
  );

  return {
    deleteLink,
  };
};
