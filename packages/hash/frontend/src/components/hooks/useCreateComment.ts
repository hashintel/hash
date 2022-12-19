import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import { EntityId } from "@hashintel/hash-shared/types";
import {
  CreateCommentMutation,
  CreateCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createComment } from "../../graphql/queries/comment.queries";
import { getPageComments } from "../../graphql/queries/page.queries";

export const useCreateComment = (pageId: EntityId) => {
  const [createCommentFn, { loading }] = useMutation<
    CreateCommentMutation,
    CreateCommentMutationVariables
  >(createComment, {
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

  const createCommentCallback = useCallback(
    async (parentEntityId: EntityId, tokens: TextToken[]) => {
      await createCommentFn({
        variables: { parentEntityId, tokens },
      });
    },
    [createCommentFn],
  );

  return [createCommentCallback, { loading }] as const;
};
