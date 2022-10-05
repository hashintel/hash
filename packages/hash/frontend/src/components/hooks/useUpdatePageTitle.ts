import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import {
  UpdateKnowledgePageMutation,
  GetPageInfoQueryVariables,
  UpdateKnowledgePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updateKnowledgePage } from "../../graphql/queries/page.queries";

export const useUpdatePageTitle = () => {
  const [updatePageFn, { loading: updatePageTitleLoading }] = useMutation<
    UpdateKnowledgePageMutation,
    UpdateKnowledgePageMutationVariables
  >(updateKnowledgePage, { awaitRefetchQueries: true });

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

  const updatePageTitle = useCallback(
    async (value: string, ownedById: string, pageEntityId: string) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { title: value },
        },
        refetchQueries: getRefetchQueries(ownedById, pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return [updatePageTitle, { updatePageTitleLoading }] as const;
};
