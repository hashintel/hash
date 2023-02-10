import { useMutation } from "@apollo/client";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { EntityId } from "@local/hash-graphql-shared/types";
import { useCallback } from "react";

import {
  CreateCommentMutation,
  CreateCommentMutationVariables,
} from "../../graphql/api-types.gen";
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
