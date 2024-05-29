import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import { useCallback } from "react";

import { useGetPageRefetchQueries } from "../components/hooks/shared/get-page-refetch-queries";
import type {
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
