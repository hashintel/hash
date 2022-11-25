import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";
import {
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";

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

  const getRefetchQueries = useCallback((pageEntityId: EntityId) => {
    const ownedById = extractOwnedByIdFromEntityId(pageEntityId);
    return [
      {
        query: getAccountPagesTree,
        variables: { ownedById },
      },
      {
        query: getPageInfoQuery,
        variables: <GetPageInfoQueryVariables>{
          entityId: pageEntityId,
        },
      },
    ];
  }, []);

  const archivePage = useCallback(
    async (value: boolean, pageEntityId: EntityId) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { archived: value },
        },
        refetchQueries: getRefetchQueries(pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [archivePage, { loading }] as const;
};
