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

export const useUpdatePageIcon = () => {
  const [updatePageFn, { loading: updatePageIconLoading }] = useMutation<
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
