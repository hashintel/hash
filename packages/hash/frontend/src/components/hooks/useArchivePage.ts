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

export const useArchivePage = (): [
  (value: boolean, accountId: string, pageEntityId: string) => Promise<void>,
  { loading: boolean },
] => {
  const [updatePageFn, { loading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: true });

  const getRefetchQueries = useCallback(
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
    async (value: boolean, accountId: string, pageEntityId: string) => {
      await updatePageFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: value },
        },
        refetchQueries: getRefetchQueries(accountId, pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [archivePage, { loading }];
};
