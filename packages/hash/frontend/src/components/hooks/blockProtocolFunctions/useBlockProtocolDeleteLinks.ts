import { useMutation } from "@apollo/client";

import { BlockProtocolDeleteLinksFunction } from "@hashintel/block-protocol";
import { deleteLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkMutation,
  DeleteLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolDeleteLinks = (
  /**
   * Providing sourceAccountId here saves blocks from having to know it
   * @todo save the FE having to deal with this at all - BE can look up the accountId
   */
  sourceAccountId: string,
): {
  deleteLinks: BlockProtocolDeleteLinksFunction;
  deleteLinksLoading: boolean;
  deleteLinksError: any;
} => {
  const [
    runDeleteLinkMutation,
    { loading: deleteLinksLoading, error: deleteLinksError },
  ] = useMutation<DeleteLinkMutation, DeleteLinkMutationVariables>(
    deleteLinkMutation,
  );

  const deleteLinks: BlockProtocolDeleteLinksFunction = useCallback(
    async (actions) => {
      const results: boolean[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const action of actions) {
        const { data } = await runDeleteLinkMutation({
          variables: {
            ...action,
            sourceAccountId,
          },
        });
        results.push(!!data?.deleteLink);
      }
      return results;
    },
    [sourceAccountId, runDeleteLinkMutation],
  );

  return {
    deleteLinks,
    deleteLinksLoading,
    deleteLinksError,
  };
};
