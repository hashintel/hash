import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@local/hash-graphql-shared/queries/page.queries";
import {
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-graphql-shared/types";
import { useCallback } from "react";

import {
  GetPageInfoQueryVariables,
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updatePage } from "../../graphql/queries/page.queries";

export const useUpdatePageTitle = () => {
  const [updatePageFn, { loading: updatePageTitleLoading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: true });

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
