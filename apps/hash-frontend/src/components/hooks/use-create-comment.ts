import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { useCallback } from "react";

import type {
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
    awaitRefetchQueries: false,
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
    async (parentEntityId: EntityId, textualContent: TextToken[]) => {
      await createCommentFn({
        variables: { parentEntityId, textualContent },
      });
    },
    [createCommentFn],
  );

  return [createCommentCallback, { loading }] as const;
};
