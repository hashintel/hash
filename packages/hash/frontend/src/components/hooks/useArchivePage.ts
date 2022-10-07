import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import {
  GetPageInfoQueryVariables,
  UpdatePersistedPageMutation,
  UpdatePersistedPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updatePersistedPage } from "../../graphql/queries/page.queries";

export const useArchivePage = () => {
  const [updatePageFn, { loading }] = useMutation<
    UpdatePersistedPageMutation,
    UpdatePersistedPageMutationVariables
  >(updatePersistedPage, { awaitRefetchQueries: true });

  const getRefetchQueries = useCallback(
    (ownedById: string, pageEntityId: string) => [
      {
        query: getAccountPagesTree,
        variables: { ownedById },
      },
      {
        query: getPageInfoQuery,
        variables: <GetPageInfoQueryVariables>{
          entityId: pageEntityId,
          ownedById,
        },
      },
    ],
    [],
  );

  const archivePage = useCallback(
    async (value: boolean, ownedById: string, pageEntityId: string) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { archived: value },
        },
        refetchQueries: getRefetchQueries(ownedById, pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [archivePage, { loading }] as const;
};
