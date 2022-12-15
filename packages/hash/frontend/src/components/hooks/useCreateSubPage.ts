import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  EntityId,
  extractEntityUuidFromEntityId,
} from "@hashintel/hash-subgraph";
import {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage, setParentPage } from "../../graphql/queries/page.queries";
import { useWorkspaceShortnameByEntityUuid } from "./use-get-workspace-shortname-by-entity-uuid";

export const useCreateSubPage = (ownedById: string) => {
  const router = useRouter();
  const { workspaceShortname } = useWorkspaceShortnameByEntityUuid({
    entityUuid: ownedById,
  });

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage);

  const [setParentPageFn, { loading: setParentPageLoading }] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    awaitRefetchQueries: true,
    refetchQueries: () => [
      { query: getAccountPagesTree, variables: { ownedById } },
    ],
  });

  const createSubPage = useCallback(
    async (parentPageEntityId: EntityId, prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "Untitled" } },
      });

      if (response.data?.createPage) {
        const pageEntityId =
          response.data?.createPage?.metadata.editionId.baseId;

        await setParentPageFn({
          variables: {
            pageEntityId,
            parentPageEntityId,
            prevIndex,
          },
        });

        if (pageEntityId) {
          const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
          return router.push(`/@${workspaceShortname}/${pageEntityUuid}`);
        }
      }
    },
    [createPageFn, ownedById, setParentPageFn, router, workspaceShortname],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
