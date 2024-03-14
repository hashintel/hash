import { useMutation } from "@apollo/client";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import type { EntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  UpdateCommentTextMutation,
  UpdateCommentTextMutationVariables,
} from "../../graphql/api-types.gen";
import { updateCommentText } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

export const useUpdateCommentText = (pageId: EntityId) => {
  const [updatePageCommentTextFn, { loading }] = useMutation<
    UpdateCommentTextMutation,
    UpdateCommentTextMutationVariables
  >(updateCommentText, {
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

  const updatePageCommentText = useCallback(
    async (commentId: EntityId, textualContent: TextToken[]) => {
      await updatePageCommentTextFn({
        variables: { entityId: commentId, textualContent },
      });
    },
    [updatePageCommentTextFn],
  );

  return [updatePageCommentText, { loading }] as const;
};
