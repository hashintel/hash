import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { EntityId } from "@hashintel/hash-shared/types";
import { useCallback } from "react";

import {
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

  const updatePageCommentText = useCallback(
    async (commentId: EntityId, tokens: TextToken[]) => {
      await updatePageCommentTextFn({
        variables: { entityId: commentId, tokens },
      });
    },
    [updatePageCommentTextFn],
  );

  return [updatePageCommentText, { loading }] as const;
};
