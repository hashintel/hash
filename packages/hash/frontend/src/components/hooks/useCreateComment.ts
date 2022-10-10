import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import {
  CreatePersistedCommentMutation,
  CreatePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createPersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useCreateComment = (ownedById: string, pageId: string) => {
  const [createCommentFn, { loading }] = useMutation<
    CreatePersistedCommentMutation,
    CreatePersistedCommentMutationVariables
  >(createPersistedComment, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getPersistedPageComments,
        variables: {
          ownedById: data?.createPersistedComment.ownedById,
          pageId,
        },
      },
    ],
  });

  const createComment = useCallback(
    async (parentId: string, tokens: TextToken[]) => {
      await createCommentFn({
        variables: { ownedById, parentId, tokens },
      });
    },
    [createCommentFn, ownedById],
  );

  return [createComment, { loading }] as const;
};
