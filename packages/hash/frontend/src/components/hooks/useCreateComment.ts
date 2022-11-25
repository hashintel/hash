import { useMutation } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { useCallback } from "react";
import { EntityId } from "@hashintel/hash-subgraph";
import {
  CreatePersistedCommentMutation,
  CreatePersistedCommentMutationVariables,
} from "../../graphql/apiTypes.gen";
import { createPersistedComment } from "../../graphql/queries/comment.queries";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export const useCreateComment = (pageId: EntityId) => {
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
    async (parentEntityId: EntityId, tokens: TextToken[]) => {
      await createCommentFn({
        variables: { parentEntityId, tokens },
      });
    },
    [createCommentFn],
  );

  return [createComment, { loading }] as const;
};
