import { useMutation } from "@apollo/client";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-types";
import { useCallback } from "react";

import {
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { setParentPage } from "../../graphql/queries/page.queries";

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
              query: getAccountPagesTree,
              variables: {
                ownedById: extractOwnedByIdFromEntityId(
                  data.setParentPage.metadata.recordId.entityId,
                ),
              },
            },
          ]
        : [],
  });

  const reorderPage = useCallback(
    async (
      pageEntityId: EntityId,
      parentPageEntityId: EntityId | null,
      prevIndex: string | null,
      nextIndex: string | null,
    ) => {
      await setParentPageFn({
        variables: {
          parentPageEntityId,
          pageEntityId,
          prevIndex,
          nextIndex,
        },
      });
    },
    [setParentPageFn],
  );

  return [reorderPage, { loading }] as const;
};
