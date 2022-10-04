import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import {
  CreateCommentMutation,
  CreateCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

export const useCreateComment = (accountId: string, pageId: string) => {
  const [createCommentFn, { loading }] = useMutation<
    CreateCommentMutation,
    CreateCommentMutationVariables
  >(createComment, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getPageComments,
        variables: {
          accountId: data!.createComment.accountId,
          pageId,
        },
      },
    ],
  });

  const createBlockComment = useCallback(
    async (parentId: string, tokens: TextToken[]) => {
      await createCommentFn({
        variables: { accountId, parentId, tokens },
      });
    },
    [createCommentFn, accountId],
  );

  return [createBlockComment, { loading }] as const;
};
