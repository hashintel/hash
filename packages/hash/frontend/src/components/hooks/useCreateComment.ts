import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import {
  CreatePersistedCommentMutation,
  CreatePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createPersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useCreateComment = (pageId: string) => {
  const [createCommentFn, { loading }] = useMutation<
    CreatePersistedCommentMutation,
    CreatePersistedCommentMutationVariables
  >(createPersistedComment, {
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

  const createComment = useCallback(
    async (parentEntityId: string, tokens: TextToken[]) => {
      await createCommentFn({
        variables: { parentEntityId, tokens },
      });
    },
    [createCommentFn],
  );

  return [createComment, { loading }] as const;
};
