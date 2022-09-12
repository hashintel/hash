import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import {
  CreateCommentMutation,
  CreateCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createComment } from "../../graphql/queries/comment.queries";

export const useCreateComment = (
  accountId: string,
): [
  (parentId: string, content: TextToken[]) => Promise<void>,
  { loading: boolean },
] => {
  const [createCommentFn, { loading }] = useMutation<
    CreateCommentMutation,
    CreateCommentMutationVariables
  >(createComment);

  const createBlockComment = useCallback(
    async (parentId: string, content: TextToken[]) => {
      await createCommentFn({
        variables: { accountId, parentId, content },
      });
    },
    [createCommentFn, accountId],
  );

  return [createBlockComment, { loading }];
};
