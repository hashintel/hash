import { useMutation } from "@apollo/client";

import { BlockProtocolDeleteLinkFn } from "@hashintel/block-protocol";
import { deleteLinkMutation } from "@hashintel/hash-shared/queries/link.queries";
import { useCallback } from "react";
import {
  DeleteLinkMutation,
  DeleteLinkMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolDeleteLink = (
  /**
   * Providing sourceAccountId here saves blocks from having to know it
   * @todo save the FE having to deal with this at all - BE can look up the accountId
   */
  sourceAccountId: string,
): {
  deleteLink: BlockProtocolDeleteLinkFn;
  deleteLinkLoading: boolean;
  deleteLinkError: any;
} => {
  const [deleteFn, { loading: deleteLinkLoading, error: deleteLinkError }] =
    useMutation<DeleteLinkMutation, DeleteLinkMutationVariables>(
      deleteLinkMutation,
    );

  const deleteLink: BlockProtocolDeleteLinkFn = useCallback(
    (payload) =>
      deleteFn({
        variables: {
          ...payload,
          sourceAccountId,
        },
      }).then(({ data }) => !!data?.deleteLinkByPath),

    [sourceAccountId, deleteFn],
  );

  return {
    deleteLink,
    deleteLinkLoading,
    deleteLinkError,
  };
};
