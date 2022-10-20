import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  UpdatePersistedCommentMutation,
  UpdatePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { updatePersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useDeleteComment = (pageId: string) => {
  const [updateCommentFn, { loading }] = useMutation<
    UpdatePersistedCommentMutation,
    UpdatePersistedCommentMutationVariables
  >(updatePersistedComment, {
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
      await updateCommentFn({
        variables: {
          entityId: commentId,
          updatedProperties: { deletedAt: new Date().getTime().toString() },
        },
      });
    },
    [updateCommentFn],
  );

  return [deleteComment, { loading }] as const;
};
