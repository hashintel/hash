import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage, setParentPage } from "../../graphql/queries/page.queries";

export const useCreateSubPage = (accountId: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage);

  const [setParentPageFn, { loading: setParentPageLoading }] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { accountId: data!.setParentPage.accountId },
      },
    ],
  });

  const createSubPage = useCallback(
    async (parentPageEntityId: string) => {
      const response = await createPageFn({
        variables: { accountId, properties: { title: "Untitled" } },
      });

      if (response.data?.createPage) {
        const { accountId: pageAccountId, entityId: pageEntityId } =
          response.data.createPage;

        await setParentPageFn({
          variables: {
            accountId: pageAccountId,
            pageEntityId,
            parentPageEntityId,
          },
        });

        return router.push(`/${pageAccountId}/${pageEntityId}`);
      }
    },
    [createPageFn, accountId, setParentPageFn, router],
  );

  return {
    createSubPage,
    loading: createPageLoading || setParentPageLoading,
  };
};
