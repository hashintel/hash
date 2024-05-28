import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import { useCallback } from "react";

import type {
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
