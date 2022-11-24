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

export const useUpdatePageIcon = () => {
  const [updatePageFn, { loading: updatePageIconLoading }] = useMutation<
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

  const updatePageIcon = useCallback(
    async (icon: string, pageEntityId: EntityId) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { icon },
        },
        refetchQueries: getRefetchQueries(pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [updatePageIcon, { updatePageIconLoading }] as const;
};
