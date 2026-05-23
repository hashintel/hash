import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import { useGetPageRefetchQueries } from "../components/hooks/shared/get-page-refetch-queries";
import { updatePage } from "../graphql/queries/page.queries";

import type { UpdatePageMutation, UpdatePageMutationVariables } from "../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";

export const useUpdatePageIcon = () => {
  const [updatePageFn, { loading: updatePageIconLoading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: false });

  const getRefetchQueries = useGetPageRefetchQueries();

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
