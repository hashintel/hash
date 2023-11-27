import { useMutation } from "@apollo/client";
import { EntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { useGetPageRefetchQueries } from "../components/hooks/shared/get-page-refetch-queries";
import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../graphql/api-types.gen";
import { updatePage } from "../graphql/queries/page.queries";

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
