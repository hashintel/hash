import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import { createPage } from "@hashintel/hash-shared/queries/page.queries";
import { useCallback } from "react";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPages } from "../../graphql/queries/account.queries";
import { setParentPage } from "../../graphql/queries/page.queries";

/**
 * Consider splitting this hook into two
 * so that it's easier to return error/loading
 * @see https://github.com/hashintel/hash/pull/409#discussion_r839416785
 */

export const useCreatePage = (accountId: string) => {
  const router = useRouter();

  const [createPageFn] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    refetchQueries: ({ data }) => [
      {
        query: getAccountPages,
        variables: { accountId: data.createPage.accountId },
      },
    ],
  });

  const [setParentPageFn] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    refetchQueries: ({ data }) => [
      {
        query: getAccountPages,
        variables: { accountId: data.setParentPage.accountId },
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

  const createSubPage = useCallback(
    async (parentPageEntityId: string) => {
      const response = await createPageFn({
        variables: { accountId, properties: { title: "Untitled" } },
      });

      const { accountId: pageAccountId, entityId: pageEntityId } =
        response.data?.createPage ?? {};

      if (pageAccountId && pageEntityId) {
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
    createUntitledPage,
    createSubPage,
  };
};
