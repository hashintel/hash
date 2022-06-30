import { useMutation } from "@apollo/client";
import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  getPageInfoQuery,
  updatePage,
} from "@hashintel/hash-shared/queries/page.queries";
import { useRouter } from "next/router";

import { useCallback, useMemo } from "react";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useArchivePage = () => {
  const router = useRouter();

  const [updatePageFn] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage);

  const getRefecthQueries = useMemo(
    () => (accountId: string, pageEntityId: string) =>
      [
        {
          query: getAccountPages,
          variables: { accountId },
        },
        {
          query: getPageInfoQuery,
          variables: {
            entityId: pageEntityId,
            accountId,
            version: router.query.version,
          },
        },
      ],
    [router.query.version],
  );

  const archivePage = useCallback(
    async (accountId: string, pageEntityId: string) =>
      await updatePageFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: true },
        },
        refetchQueries: getRefecthQueries(accountId, pageEntityId),
      }),
    [updatePageFn, getRefecthQueries],
  );

  const unarchivePage = useCallback(
    async (accountId: string, pageEntityId: string) =>
      await updatePageFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: false },
        },
        refetchQueries: getRefecthQueries(accountId, pageEntityId),
      }),
    [updatePageFn, getRefecthQueries],
  );

  return { archivePage, unarchivePage };
};
