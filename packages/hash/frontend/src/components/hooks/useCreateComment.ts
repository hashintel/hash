import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import {
  CreateCommentMutation,
  CreateCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createComment } from "../../graphql/queries/comment.queries";

export const useCreateComment = (accountId: string) => {
  const [createCommentFn, { loading }] = useMutation<
    CreateCommentMutation,
    CreateCommentMutationVariables
  >(createComment);

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
