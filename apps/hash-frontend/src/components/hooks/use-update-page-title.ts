import { useMutation } from "@apollo/client";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { updatePage } from "../../graphql/queries/page.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

export const useUpdatePageTitle = () => {
  const [updatePageFn, { loading: updatePageTitleLoading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: true });

  const getRefetchQueries = useCallback(
    (pageEntityId: EntityId) => [
      {
        query: structuralQueryEntitiesQuery,
        variables: getAccountPagesVariables({
          ownedById: extractOwnedByIdFromEntityId(pageEntityId),
        }),
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
