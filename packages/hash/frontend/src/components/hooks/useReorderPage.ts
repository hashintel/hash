import { useMutation } from "@apollo/client";
import { useCallback } from "react";
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
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { ownedById: data!.setParentPersistedPage.ownedById },
      },
    ],
  });

  const reorderPage = useCallback(
    async (
      pageEntityId: string,
      parentPageEntityId: string | null,
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
