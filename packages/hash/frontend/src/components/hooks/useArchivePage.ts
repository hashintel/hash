import { useMutation } from "@apollo/client";
import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  getPageInfoQuery,
  updatePage,
} from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";

export const useArchivePage = () => {
  const [updatePageFn] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage);

  const getRefecthQueries = useCallback(
    (accountId: string, pageEntityId: string) => [
      {
        query: getAccountPagesTree,
        variables: { accountId },
      },
      {
        query: getPageInfoQuery,
        variables: {
          entityId: pageEntityId,
          accountId,
        },
      },
    ],
    [],
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
