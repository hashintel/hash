import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-types";
import { useCallback } from "react";

import {
  GetPageInfoQueryVariables,
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updatePage } from "../../graphql/queries/page.queries";

export const useArchivePage = () => {
  const [updatePageFn, { loading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: true });

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
