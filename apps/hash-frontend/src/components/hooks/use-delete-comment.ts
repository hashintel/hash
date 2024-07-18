import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import { useCallback } from "react";

import type {
  DeleteCommentMutation,
  DeleteCommentMutationVariables,
} from "../../graphql/api-types.gen";
import { deleteComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

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
