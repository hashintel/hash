import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { EntityId, splitEntityId } from "@hashintel/hash-subgraph";
import {
  CreatePersistedPageMutation,
  CreatePersistedPageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import {
  createPersistedPage,
  setParentPage,
} from "../../graphql/queries/page.queries";

export const useCreateSubPage = (ownedById: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePersistedPageMutation,
    CreatePersistedPageMutationVariables
  >(createPersistedPage);

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

      if (response.data?.createPersistedPage) {
        const pageEntityId =
          response.data?.createPersistedPage?.metadata.editionId.baseId;

        await setParentPageFn({
          variables: {
            pageEntityId,
            parentPageEntityId,
            prevIndex,
          },
        });

        if (pageEntityId) {
          const [pageOwnedById, pageEntityUuid] = splitEntityId(pageEntityId);
          return router.push(`/${pageOwnedById}/${pageEntityUuid}`);
        }
      }
    },
    [createPageFn, ownedById, setParentPageFn, router],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
