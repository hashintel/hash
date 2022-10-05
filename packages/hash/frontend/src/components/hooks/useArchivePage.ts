import { useMutation } from "@apollo/client";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";

import { useCallback } from "react";
import {
  UpdateKnowledgePageMutation,
  UpdateKnowledgePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { updateKnowledgePage } from "../../graphql/queries/page.queries";

export const useArchivePage = () => {
  const [updatePageFn, { loading }] = useMutation<
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
        variables: {
          entityId: pageEntityId,
          accountId: ownedById,
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
