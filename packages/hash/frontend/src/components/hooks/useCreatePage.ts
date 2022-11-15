import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  CreatePersistedPageMutation,
  CreatePersistedPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPersistedPage } from "../../graphql/queries/page.queries";

export const useCreatePage = (ownedById: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePersistedPageMutation,
    CreatePersistedPageMutationVariables
  >(createPersistedPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { ownedById: data?.createPersistedPage.ownedById },
      },
    ],
  });

  const createUntitledPage = useCallback(
    async (prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "", prevIndex } },
      });

      const { ownedById: pageOwnedById, entityId: pageEntityId } =
        response.data?.createPersistedPage ?? {};

      if (pageOwnedById && pageEntityId) {
        return router.push(`/${pageOwnedById}/${pageEntityId}`);
      }
    },
    [createPageFn, ownedById, router],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
