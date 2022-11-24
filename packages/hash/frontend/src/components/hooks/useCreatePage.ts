import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
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
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: getAccountPagesTree,
              variables: {
                ownedById: extractOwnedByIdFromEntityId(
                  data.createPersistedPage.metadata.editionId.baseId,
                ),
              },
            },
          ]
        : [],
  });

  const createUntitledPage = useCallback(
    async (prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "", prevIndex } },
      });

      const pageEntityId =
        response.data?.createPersistedPage?.metadata.editionId.baseId;

      if (pageEntityId) {
        const pageOwnedById = extractOwnedByIdFromEntityId(pageEntityId);
        const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
        return router.push(`/${pageOwnedById}/${pageEntityUuid}`);
      }
    },
    [createPageFn, ownedById, router],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
