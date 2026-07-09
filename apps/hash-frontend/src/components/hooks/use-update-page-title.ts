import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import { updatePage } from "../../graphql/queries/page.queries";
import { useGetPageRefetchQueries } from "./shared/get-page-refetch-queries";

import type {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";

export const useUpdatePageTitle = () => {
  const [updatePageFn, { loading: updatePageTitleLoading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, { awaitRefetchQueries: false });

  const getRefetchQueries = useGetPageRefetchQueries();

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
