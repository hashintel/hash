import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import { EntityId } from "@hashintel/hash-subgraph";
import {
  DeleteCommentMutation,
  DeleteCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { deleteComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

export const useDeleteComment = (pageId: EntityId) => {
  const [deleteCommentFn, { loading }] = useMutation<
    DeleteCommentMutation,
    DeleteCommentMutationVariables
  >(deleteComment, {
    awaitRefetchQueries: true,
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
