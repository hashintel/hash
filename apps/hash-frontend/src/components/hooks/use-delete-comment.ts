import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import { deleteComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

import type {
  DeleteCommentMutation,
  DeleteCommentMutationVariables,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";

export const useDeleteComment = (pageId: EntityId) => {
  const [deleteCommentFn, { loading }] = useMutation<
    DeleteCommentMutation,
    DeleteCommentMutationVariables
  >(deleteComment, {
    awaitRefetchQueries: false,
    refetchQueries: () => [
      {
        query: getPageComments,
        variables: {
          entityId: pageId,
        },
      },
    ],
  });

  const deleteCommentCallback = useCallback(
    async (commentId: EntityId) => {
      await deleteCommentFn({
        variables: {
          entityId: commentId,
        },
      });
    },
    [deleteCommentFn],
  );

  return [deleteCommentCallback, { loading }] as const;
};
