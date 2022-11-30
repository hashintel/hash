import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
import {
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
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
                  data.setParentPage.metadata.editionId.baseId,
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
