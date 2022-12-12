import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@hashintel/hash-subgraph";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";
import { useGetWorkspaceShortnameByEntityUuid } from "./use-get-workspace-shortname-by-entity-uuid";

export const useCreatePage = (ownedById: string) => {
  const router = useRouter();

  const { workspaceShortname } = useGetWorkspaceShortnameByEntityUuid({
    entityUuid: ownedById,
  });

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

      if (pageEntityId && workspaceShortname) {
        const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
        return router.push(`/@${workspaceShortname}/${pageEntityUuid}`);
      }
    },
    [createPageFn, ownedById, router, workspaceShortname],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
