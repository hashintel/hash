import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { setParentPage } from "../../graphql/queries/page.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

export const useReorderPage = () => {
  const [setParentPageFn, { loading }] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: structuralQueryEntitiesQuery,
              variables: getAccountPagesVariables({
                ownedById: extractOwnedByIdFromEntityId(
                  data.setParentPage.metadata.recordId.entityId,
                ),
              }),
            },
          ]
        : [],
  });

  const reorderPage = useCallback(
    async (
      pageEntityId: EntityId,
      parentPageEntityId: EntityId | null,
      prevFractionalIndex: string | null,
      nextIndex: string | null,
    ) => {
      await setParentPageFn({
        variables: {
          parentPageEntityId,
          pageEntityId,
          prevFractionalIndex,
          nextIndex,
        },
      });
    },
    [setParentPageFn],
  );

  return [reorderPage, { loading }] as const;
};
