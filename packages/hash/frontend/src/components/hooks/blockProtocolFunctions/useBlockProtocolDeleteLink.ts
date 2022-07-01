import { useMutation } from "@apollo/client";

import {
  EmbedderGraphMessageCallbacks
} from "@blockprotocol/graph";
import { deleteLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkMutation,
  DeleteLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolDeleteLink = (): {
  deleteLink: EmbedderGraphMessageCallbacks["deleteLink"];
  deleteLinkLoading: boolean;
  deleteLinkError: any;
} => {
  const [
    runDeleteLinkMutation,
    { loading: deleteLinkLoading, error: deleteLinkError },
  ] = useMutation<DeleteLinkMutation, DeleteLinkMutationVariables>(
    deleteLinkMutation,
  );

  const deleteLink: EmbedderGraphMessageCallbacks["deleteLink"] = useCallback(
    async ({ data }) => {
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
    }
      const results: boolean[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        if (!action.sourceAccountId) {
          throw new Error("deleteLink needs to be passed a sourceAccountId");
        }

        const { data, errors } = await runDeleteLinkMutation({
          variables: {
            linkId: action.linkId,
            sourceAccountId: action.sourceAccountId,
          },
        });

        if (!data) {
          throw new Error(`Could not delete link: ${errors?.[0]!.message}`);
        }

        results.push(data.deleteLink);
      }
      return results;
    },
    [runDeleteLinkMutation],
  );

  return {
    deleteLink,
    deleteLinkLoading,
    deleteLinkError,
  };
};
