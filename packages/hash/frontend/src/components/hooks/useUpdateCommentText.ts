import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import { EntityId } from "@hashintel/hash-subgraph";
import {
  UpdatePersistedCommentTextMutation,
  UpdatePersistedCommentTextMutationVariables,
} from "../../graphql/apiTypes.gen";
import { updatePersistedCommentText } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useUpdateCommentText = (pageId: EntityId) => {
  const [updatePageCommentTextFn, { loading }] = useMutation<
    UpdatePersistedCommentTextMutation,
    UpdatePersistedCommentTextMutationVariables
  >(updatePersistedCommentText, {
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
