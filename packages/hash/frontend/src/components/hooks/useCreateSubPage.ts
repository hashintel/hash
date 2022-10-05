import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  CreateKnowledgePageMutation,
  CreateKnowledgePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import {
  createKnowledgePage,
  setParentPage,
} from "../../graphql/queries/page.queries";

export const useCreateSubPage = (ownedById: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreateKnowledgePageMutation,
    CreateKnowledgePageMutationVariables
  >(createKnowledgePage);

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
    async (parentPageEntityId: string, prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "Untitled" } },
      });

      if (response.data?.createKnowledgePage) {
        const { ownedById: pageOwnedById, entityId: pageEntityId } =
          response.data.createKnowledgePage;

        await setParentPageFn({
          variables: {
            pageEntityId,
            parentPageEntityId,
            prevIndex,
          },
        });

        await router.push(`/${pageOwnedById}/${pageEntityId}`);
      }
    },
    [createPageFn, ownedById, setParentPageFn, router],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
