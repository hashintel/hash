import { useMutation } from "@apollo/client";
import { EntityId } from "@local/hash-graphql-shared/types";
import { useCallback } from "react";

import {
  ResolveCommentMutation,
  ResolveCommentMutationVariables,
} from "../../graphql/api-types.gen";
import { resolveComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

export const useResolveComment = (pageId: EntityId) => {
  const [resolveCommentFn, { loading }] = useMutation<
    ResolveCommentMutation,
    ResolveCommentMutationVariables
  >(resolveComment, {
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

  const resolveCommentCallback = useCallback(
    async (commentId: EntityId) => {
      await resolveCommentFn({
        variables: {
          entityId: commentId,
        },
      });
    },
    [resolveCommentFn],
  );

  return [resolveCommentCallback, { loading }] as const;
};
