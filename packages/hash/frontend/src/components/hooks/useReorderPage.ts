import { useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { setParentPage } from "../../graphql/queries/page.queries";

export const useReorderPage = (accountId: string) => {
  const [setParentPageFn] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { accountId: data!.setParentPage.accountId },
      },
    ],
  });

  const reorderPage = useCallback(
    async (
      pageEntityId: string,
      parentPageEntityId: string | null,
      index: number,
    ) => {
      return setParentPageFn({
        variables: {
          accountId,
          parentPageEntityId,
          pageEntityId,
          index,
        },
      });
    },
    [accountId, setParentPageFn],
  );

  return {
    reorderPage,
  };
};
