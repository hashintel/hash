import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import {
  ArchivePageMutation,
  ArchivePageMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { archivePage as archivePageMutation } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useArchivePage = (accountId: string) => {
  const router = useRouter();

  const [archivePageFn] = useMutation<
    ArchivePageMutation,
    ArchivePageMutationVariables
  >(archivePageMutation, {
    refetchQueries: () => [
      {
        query: getAccountPages,
        variables: { accountId },
      },
    ],
  });

  const archivePage = useCallback(
    async (pageEntityId: string) => {
      await archivePageFn({
        variables: {
          accountId,
          pageEntityId,
        },
      });

      if (router.asPath === `/${accountId}/${pageEntityId}`) {
        return router.push(`/${accountId}`);
      }
    },
    [archivePageFn, accountId, router],
  );

  return archivePage;
};
