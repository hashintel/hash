import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  ResolvePersistedCommentMutation,
  ResolvePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { resolvePersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useResolveComment = (pageId: string) => {
  const [resolveCommentFn, { loading }] = useMutation<
    ResolvePersistedCommentMutation,
    ResolvePersistedCommentMutationVariables
  >(resolvePersistedComment, {
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

  const resolveComment = useCallback(
    async (commentId: string) => {
      await resolveCommentFn({
        variables: {
          entityId: commentId,
        },
      });
    },
    [resolveCommentFn],
  );

  return [resolveComment, { loading }] as const;
};
