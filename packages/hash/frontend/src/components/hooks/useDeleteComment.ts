import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  DeletePersistedCommentMutation,
  DeletePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { deletePersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useDeleteComment = (pageId: string) => {
  const [deleteCommentFn, { loading }] = useMutation<
    DeletePersistedCommentMutation,
    DeletePersistedCommentMutationVariables
  >(deletePersistedComment, {
    awaitRefetchQueries: true,
    refetchQueries: () => [
      {
        query: getPersistedPageComments,
        variables: {
          entityId: pageId,
        },
      },
    ],
  });

  const deleteComment = useCallback(
    async (commentId: string) => {
      await deleteCommentFn({
        variables: {
          entityId: commentId,
        },
      });
    },
    [deleteCommentFn],
  );

  return [deleteComment, { loading }] as const;
};
