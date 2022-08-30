import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";

export const useCreatePage = (
  accountId: string,
): [() => Promise<boolean | undefined>, { loading: boolean }] => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { accountId: data!.createPage.accountId },
      },
    ],
  });

  const createUntitledPage = useCallback(async () => {
    const response = await createPageFn({
      variables: { accountId, properties: { title: "Untitled" } },
    });

    const { accountId: pageAccountId, entityId: pageEntityId } =
      response.data?.createPage ?? {};

    if (pageAccountId && pageEntityId) {
      return router.push(`/${pageAccountId}/${pageEntityId}`);
    }
  }, [createPageFn, accountId, router]);

  return [createUntitledPage, { loading: createPageLoading }];
};
