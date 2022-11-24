import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import {
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
import {
  GetPageInfoQueryVariables,
  UpdatePersistedPageMutation,
  UpdatePersistedPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updatePersistedPage } from "../../graphql/queries/page.queries";

export const useUpdatePageTitle = () => {
  const [updatePageFn, { loading: updatePageTitleLoading }] = useMutation<
    UpdatePersistedPageMutation,
    UpdatePersistedPageMutationVariables
  >(updatePersistedPage, { awaitRefetchQueries: true });

  const getRefetchQueries = useCallback(
    (pageEntityId: EntityId) => [
      {
        query: getAccountPagesTree,
        variables: { ownedById: extractOwnedByIdFromEntityId(pageEntityId) },
      },
      {
        query: getPageInfoQuery,
        variables: <GetPageInfoQueryVariables>{
          entityId: pageEntityId,
        },
      },
    ],
    [],
  );

  const updatePageTitle = useCallback(
    async (title: string, pageEntityId: EntityId) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { title },
        },
        refetchQueries: getRefetchQueries(pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [updatePageTitle, { updatePageTitleLoading }] as const;
};
