import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@hashintel/hash-subgraph";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";

export const useCreatePage = (ownedById: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: getAccountPagesTree,
              variables: {
                ownedById: extractOwnedByIdFromEntityId(
                  data.createPage.metadata.editionId.baseId,
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

      const pageEntityId = response.data?.createPage?.metadata.editionId.baseId;

      if (pageEntityId) {
        const [pageOwnedById, pageEntityUuid] = splitEntityId(pageEntityId);
        return router.push(`/${pageOwnedById}/${pageEntityUuid}`);
      }
    },
    [createPageFn, ownedById, router],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
