import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { updatePage } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useArchivePage = (accountId: string) => {
  const router = useRouter();

  const [updateEntityFn] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, {
    refetchQueries: () => [
      {
        query: getAccountPages,
        variables: { accountId },
      },
    ],
  });

  const archivePage = useCallback(
    async (pageEntityId: string) => {
      await updateEntityFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: true },
        },
      });

      if (router.asPath === `/${accountId}/${pageEntityId}`) {
        return router.push(`/${accountId}`);
      }
    },
    [updateEntityFn, accountId, router],
  );

  return archivePage;
};
